import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUp, ChevronRight, RefreshCcw, X } from 'lucide-react'

import { Button } from '#/components/ui/button'

import { normalizeDirUri, parentUri } from '../-lib/normalize'
import { useInvalidateVikingFs, useVikingFsList } from '../-hooks/viking-fm'
import type { VikingFsEntry } from '../-types/viking-fm'
import { FileList } from './file-list'
import { FilePreview } from './file-preview'
import { FileTree } from './file-tree'

interface VikingFileManagerProps {
  initialUri?: string
  onUriChange?: (uri: string) => void
  onFileChange?: (fileUri: string | undefined) => void
}

function getAncestorUris(uri: string): Array<string> {
  const normalized = normalizeDirUri(uri)
  if (normalized === 'viking://') {
    return ['viking://']
  }

  const body = normalized.slice('viking://'.length, -1)
  const parts = body.split('/').filter(Boolean)

  const ancestors = ['viking://']
  let running = 'viking://'
  for (const part of parts) {
    running = `${running}${part}/`
    ancestors.push(running)
  }

  return ancestors
}

export function VikingFileManager({
  initialUri,
  onUriChange,
  onFileChange,
}: VikingFileManagerProps) {
  const [currentUri, setCurrentUri] = useState(
    normalizeDirUri(initialUri || 'viking://'),
  )
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(
    new Set(['viking://']),
  )
  const [openTabs, setOpenTabs] = useState<VikingFsEntry[]>([])
  const [activeTabUri, setActiveTabUri] = useState<string | null>(null)
  const [closingTabs, setClosingTabs] = useState<Set<string>>(new Set())
  const activeFile = openTabs.find((t) => t.uri === activeTabUri) ?? null

  useEffect(() => {
    const normalized = normalizeDirUri(initialUri || 'viking://')
    setCurrentUri(normalized)
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      for (const ancestor of getAncestorUris(normalized)) {
        next.add(ancestor)
      }
      return next
    })
  }, [initialUri])

  const updateUri = (uri: string) => {
    const normalized = normalizeDirUri(uri)
    setCurrentUri(normalized)
    setActiveTabUri(null)
  }

  const openFile = useCallback((file: VikingFsEntry) => {
    setOpenTabs((prev) => {
      if (prev.some((t) => t.uri === file.uri)) return prev
      return [...prev, file]
    })
    setActiveTabUri(file.uri)
  }, [])

  const closeTab = useCallback((uri: string) => {
    setClosingTabs((prev) => new Set(prev).add(uri))
    setActiveTabUri((currentActive) => {
      if (currentActive !== uri) return currentActive
      const remaining = openTabs.filter((t) => t.uri !== uri)
      if (remaining.length === 0) return null
      const idx = openTabs.findIndex((t) => t.uri === uri)
      return remaining[Math.min(idx, remaining.length - 1)].uri
    })
  }, [openTabs])

  const removeTab = useCallback((uri: string) => {
    setClosingTabs((prev) => {
      const next = new Set(prev)
      next.delete(uri)
      return next
    })
    setOpenTabs((prev) => prev.filter((t) => t.uri !== uri))
  }, [])

  const navigateToDir = useCallback((uri: string) => {
    setActiveTabUri(null)
    updateUri(uri)
  }, [])

  const listQuery = useVikingFsList(currentUri, {
    output: 'agent',
    showAllHidden: true,
    nodeLimit: 500,
  })
  const { invalidateList } = useInvalidateVikingFs()

  const entries = useMemo(
    () => listQuery.data?.entries || [],
    [listQuery.data?.entries],
  )

  const handleGoParent = () => {
    updateUri(parentUri(currentUri))
  }

  const handleRefresh = async () => {
    await invalidateList()
    await listQuery.refetch()
  }

  useEffect(() => {
    onUriChange?.(currentUri)
  }, [currentUri, onUriChange])

  useEffect(() => {
    onFileChange?.(activeTabUri ?? undefined)
  }, [activeTabUri, onFileChange])

  const breadcrumbs = useMemo(() => {
    const body = currentUri.slice('viking://'.length).replace(/\/$/, '')
    const parts = body ? body.split('/').filter(Boolean) : []
    const crumbs: Array<{ label: string; uri: string }> = [
      { label: 'viking://', uri: 'viking://' },
    ]
    let running = 'viking://'
    for (const part of parts) {
      running = `${running}${part}/`
      crumbs.push({ label: part, uri: running })
    }
    return crumbs
  }, [currentUri])

  const fileBreadcrumbs = useMemo(() => {
    if (!activeFile) return []
    const uri = activeFile.uri
    const body = uri.slice('viking://'.length)
    const parts = body ? body.split('/').filter(Boolean) : []
    const crumbs: Array<{ label: string; uri: string; isDir: boolean }> = [
      { label: 'viking://', uri: 'viking://', isDir: true },
    ]
    let running = 'viking://'
    for (let i = 0; i < parts.length; i++) {
      const isLast = i === parts.length - 1
      running = isLast ? `${running}${parts[i]}` : `${running}${parts[i]}/`
      crumbs.push({ label: parts[i], uri: running, isDir: !isLast })
    }
    return crumbs
  }, [activeFile])

  const showTree = currentUri !== 'viking://' || openTabs.length > 0
  const hasTabs = openTabs.length > 0
  const showFilePreview = activeFile !== null

  const [treeWidth, setTreeWidth] = useState(280)
  const dragging = useRef(false)

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    const startX = e.clientX
    const startWidth = treeWidth

    const onMove = (ev: MouseEvent) => {
      const newWidth = Math.min(Math.max(startWidth + ev.clientX - startX, 160), 600)
      setTreeWidth(newWidth)
    }
    const onUp = () => {
      dragging.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [treeWidth])

  return (
    <div className="-m-4 flex h-[calc(100vh-3.5rem)] flex-col">
      <div className="flex min-h-0 flex-1">
        {showTree && (
          <>
            <section className="flex min-h-0 flex-col bg-muted/30" style={{ width: treeWidth, minWidth: treeWidth }}>
              <div className="flex h-10 items-center gap-1 border-b px-2">
                <Button variant="ghost" size="icon" className="size-7" title="返回父级" onClick={handleGoParent}>
                  <ArrowUp className="size-4" />
                </Button>
                <Button variant="ghost" size="icon" className="size-7" title="刷新目录" onClick={() => void handleRefresh()}>
                  <RefreshCcw className="size-4" />
                </Button>
              </div>
              <div className="min-h-0 flex-1">
                <FileTree
                  currentUri={currentUri}
                  expandedKeys={expandedKeys}
                  onExpandedKeysChange={setExpandedKeys}
                  onSelectDirectory={updateUri}
                />
              </div>
            </section>
            <div
              className="w-1 shrink-0 cursor-col-resize border-l bg-transparent transition-colors hover:bg-primary/20 active:bg-primary/30"
              onMouseDown={handleResizeStart}
            />
          </>
        )}

        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          {hasTabs ? (
            <div className="flex h-10 items-center gap-0 overflow-x-auto border-b bg-muted/30">
              {openTabs.map((tab) => {
                const isClosing = closingTabs.has(tab.uri)
                return (
                  <button
                    key={tab.uri}
                    type="button"
                    className={`group flex shrink-0 items-center gap-1.5 border-r text-xs transition-[max-width,padding,opacity] duration-200 ease-out ${
                      isClosing
                        ? 'max-w-0 overflow-hidden px-0 opacity-0'
                        : 'animate-tab-in max-w-[200px] px-3 opacity-100'
                    } py-2 ${
                      tab.uri === activeTabUri
                        ? 'bg-background font-medium text-foreground'
                        : 'text-muted-foreground hover:bg-muted/60'
                    }`}
                    onClick={() => !isClosing && setActiveTabUri(tab.uri)}
                    onTransitionEnd={() => {
                      if (isClosing) removeTab(tab.uri)
                    }}
                  >
                    <span className="max-w-[120px] truncate">{tab.name}</span>
                    <span
                      role="button"
                      tabIndex={0}
                      className="rounded p-0.5 opacity-0 hover:bg-muted group-hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation()
                        closeTab(tab.uri)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.stopPropagation()
                          closeTab(tab.uri)
                        }
                      }}
                    >
                      <X className="size-3" />
                    </span>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="flex h-10 items-center gap-1 border-b px-3">
              {!showTree && (
                <>
                  <Button variant="ghost" size="icon" className="size-7" title="返回父级" onClick={handleGoParent}>
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="size-7" title="刷新目录" onClick={() => void handleRefresh()}>
                    <RefreshCcw className="size-4" />
                  </Button>
                  <div className="mx-1 h-4 w-px bg-border" />
                </>
              )}
              <nav className="flex items-center gap-0.5 overflow-hidden text-sm text-muted-foreground">
                {breadcrumbs.map((crumb, i) => (
                  <span key={crumb.uri} className="flex shrink-0 items-center gap-0.5">
                    {i > 0 && <ChevronRight className="size-3" />}
                    <button
                      type="button"
                      className={`rounded px-1 py-0.5 hover:bg-muted ${i === breadcrumbs.length - 1 ? 'font-medium text-foreground' : ''}`}
                      onClick={() => updateUri(crumb.uri)}
                    >
                      {crumb.label}
                    </button>
                  </span>
                ))}
              </nav>
            </div>
          )}

          {showFilePreview && fileBreadcrumbs.length > 0 && (
            <nav className="flex items-center gap-0.5 overflow-hidden border-b px-3 py-1.5 text-xs text-muted-foreground">
              {fileBreadcrumbs.map((crumb, i) => (
                <span key={crumb.uri} className="flex shrink-0 items-center gap-0.5">
                  {i > 0 && <ChevronRight className="size-3" />}
                  {crumb.isDir ? (
                    <button
                      type="button"
                      className="rounded px-1 py-0.5 hover:bg-muted hover:text-foreground"
                      onClick={() => navigateToDir(crumb.uri)}
                    >
                      {crumb.label}
                    </button>
                  ) : (
                    <span className="px-1 py-0.5 text-foreground">{crumb.label}</span>
                  )}
                </span>
              ))}
            </nav>
          )}

          {!showFilePreview && hasTabs && (
            <nav className="flex items-center gap-0.5 overflow-hidden border-b px-3 py-1.5 text-xs text-muted-foreground">
              {breadcrumbs.map((crumb, i) => (
                <span key={crumb.uri} className="flex shrink-0 items-center gap-0.5">
                  {i > 0 && <ChevronRight className="size-3" />}
                  <button
                    type="button"
                    className={`rounded px-1 py-0.5 hover:bg-muted ${i === breadcrumbs.length - 1 ? 'font-medium text-foreground' : ''}`}
                    onClick={() => updateUri(crumb.uri)}
                  >
                    {crumb.label}
                  </button>
                </span>
              ))}
            </nav>
          )}

          {showFilePreview ? (
            <div className="mx-auto min-h-0 w-full max-w-5xl flex-1">
              <FilePreview
                file={activeFile}
                onClose={() => activeTabUri && closeTab(activeTabUri)}
                showCloseButton={false}
              />
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-auto">
              <FileList
                entries={entries}
                selectedFileUri={null}
                onOpenDirectory={updateUri}
                onOpenFile={(file) => openFile(file)}
              />
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
