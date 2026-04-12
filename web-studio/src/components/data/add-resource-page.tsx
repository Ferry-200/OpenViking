import { useMutation } from '@tanstack/react-query'
import { fileTypeFromBlob } from 'file-type'
import { AlertTriangle, CheckCircle2, ChevronRight, FileIcon, FolderOpen, Globe, Loader2Icon, Upload, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Alert, AlertDescription, AlertTitle } from '#/components/ui/alert'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardContent } from '#/components/ui/card'
import { Checkbox } from '#/components/ui/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '#/components/ui/collapsible'
import { DirectoryPickerDialog } from '#/components/data/directory-picker-dialog'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { LegacyPageShell } from '#/components/legacy/shared/page-shell'
import { Progress } from '#/components/ui/progress'
import { Textarea } from '#/components/ui/textarea'
import {
  getErrorMessage,
  isRecord,
} from '#/lib/legacy/data-utils'
import {
  getOvResult,
  postResources,
  postResourcesTempUpload,
} from '#/lib/ov-client'
import {
  applyLegacyConnectionSettings,
  loadLegacyConnectionSettings,
} from '#/lib/legacy/connection'

type Mode = 'upload' | 'remote'
type UploadPhase = 'idle' | 'uploading' | 'processing' | 'done'

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function getExtensionFromName(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

export function AddResourcePage() {
  const { t } = useTranslation()

  const [mode, setMode] = useState<Mode>('upload')
  const [remoteUrl, setRemoteUrl] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [detectedType, setDetectedType] = useState<string | null>(null)
  const [parentUri, setParentUri] = useState('viking://resources/')
  const [directlyUploadMedia, setDirectlyUploadMedia] = useState(true)
  const [reason, setReason] = useState('')
  const [instruction, setInstruction] = useState('')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [dirPickerOpen, setDirPickerOpen] = useState(false)
  const [phase, setPhase] = useState<UploadPhase>('idle')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [skippedFiles, setSkippedFiles] = useState<string[]>([])

  useEffect(() => {
    applyLegacyConnectionSettings(loadLegacyConnectionSettings())
  }, [])

  const detectFileType = useCallback(async (file: File) => {
    try {
      const result = await fileTypeFromBlob(file)
      setDetectedType(result?.mime ?? null)
    } catch {
      setDetectedType(null)
    }
  }, [])

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const file = acceptedFiles[0]
      if (file) {
        setSelectedFile(file)
        detectFileType(file)
      }
    },
    [detectFileType],
  )

  const removeFile = useCallback(() => {
    setSelectedFile(null)
    setDetectedType(null)
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
  })

  const buildCommonBody = () => {
    const body: Record<string, unknown> = {
      parent: parentUri.trim() || undefined,
      strict: false,
      telemetry: true,
      wait: true,
      directly_upload_media: directlyUploadMedia,
    }
    if (reason.trim()) {
      body.reason = reason.trim()
    }
    if (instruction.trim()) {
      body.instruction = instruction.trim()
    }
    return body
  }

  const resetUploadState = useCallback(() => {
    setPhase('idle')
    setUploadProgress(0)
    setSkippedFiles([])
    setSelectedFile(null)
    setDetectedType(null)
  }, [])

  const addResourceMutation = useMutation({
    mutationFn: async () => {
      if (mode === 'upload') {
        if (!selectedFile) {
          throw new Error('Please select a file first.')
        }

        setPhase('uploading')
        setUploadProgress(0)

        const uploadResult = await getOvResult(
          postResourcesTempUpload({
            body: {
              file: selectedFile,
              telemetry: true,
            },
            onUploadProgress: (event: { loaded: number; total?: number }) => {
              if (event.total) {
                setUploadProgress(Math.round((event.loaded / event.total) * 100))
              }
            },
          }),
        )

        const tempFileId = isRecord(uploadResult)
          ? uploadResult.temp_file_id
          : undefined
        if (typeof tempFileId !== 'string' || !tempFileId.trim()) {
          throw new Error('Temp upload did not return temp_file_id.')
        }

        setPhase('processing')

        const addResourceResult = await getOvResult(
          postResources({
            body: {
              ...buildCommonBody(),
              temp_file_id: tempFileId,
              source_name: selectedFile.name,
            } as Parameters<typeof postResources>[0]['body'],
          }),
        )

        // Extract warnings (skipped files) from result
        if (isRecord(addResourceResult) && Array.isArray(addResourceResult.warnings)) {
          setSkippedFiles(addResourceResult.warnings as string[])
        }
        setPhase('done')

        return {
          add_resource: addResourceResult,
          upload: uploadResult,
        }
      }

      // remote mode
      const url = remoteUrl.trim()
      if (!url) {
        throw new Error('Please enter a remote URL.')
      }

      setPhase('processing')

      const result = await getOvResult(
        postResources({
          body: {
            ...buildCommonBody(),
            path: url,
          } as Parameters<typeof postResources>[0]['body'],
        }),
      )

      if (isRecord(result) && Array.isArray(result.warnings)) {
        setSkippedFiles(result.warnings as string[])
      }
      setPhase('done')

      return { add_resource: result }
    },
    onError: (error) => {
      setPhase('idle')
      const message = getErrorMessage(error)
      toast.error(message)
    },
    onSuccess: () => {
      toast.success(t('addResource.success'))
    },
  })

  const activeError = addResourceMutation.error
  const fileTypeLabel =
    detectedType ?? (selectedFile ? getExtensionFromName(selectedFile.name) || t('addResource.fileInfo.unknown') : null)

  const canSubmit =
    mode === 'upload' ? !!selectedFile : !!remoteUrl.trim()

  return (
    <LegacyPageShell title={t('addResource.title')} description={t('addResource.description')}>
      {activeError ? (
        <Alert variant="destructive">
          <Upload className="size-4" />
          <AlertTitle>{t('addResource.error')}</AlertTitle>
          <AlertDescription>{getErrorMessage(activeError)}</AlertDescription>
        </Alert>
      ) : null}

      <div className="max-w-4xl">
        <Card>
          <CardContent className="space-y-5 pt-6">
            {/* Mode Switch */}
            <div className="flex gap-1 rounded-lg bg-muted p-1">
              <button
                type="button"
                className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  mode === 'upload'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setMode('upload')}
              >
                <Upload className="size-4" />
                {t('addResource.mode.upload')}
              </button>
              <button
                type="button"
                className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  mode === 'remote'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setMode('remote')}
              >
                <Globe className="size-4" />
                {t('addResource.mode.remote')}
              </button>
            </div>

            {/* Upload Mode: Dropzone */}
            {mode === 'upload' ? (
              <div
                {...getRootProps()}
                className={`relative cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
                  isDragActive
                    ? 'border-primary bg-primary/5'
                    : selectedFile
                      ? 'border-border bg-muted/20'
                      : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30'
                }`}
              >
                <input {...getInputProps()} />

                {selectedFile ? (
                  <div className="flex items-center gap-4 text-left">
                    <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <FileIcon className="size-6 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="truncate text-sm font-medium">{selectedFile.name}</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-muted-foreground">{formatFileSize(selectedFile.size)}</span>
                        {fileTypeLabel ? (
                          <Badge variant="secondary" className="text-xs">
                            {fileTypeLabel}
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8 shrink-0"
                      onClick={(e) => {
                        e.stopPropagation()
                        removeFile()
                      }}
                      aria-label={t('addResource.fileInfo.remove')}
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload className="mx-auto size-10 text-muted-foreground/60" />
                    <p className="text-sm font-medium">{t('addResource.dropzone.title')}</p>
                    <p className="text-xs text-muted-foreground">{t('addResource.dropzone.hint')}</p>
                    <p className="text-xs text-muted-foreground/70">{t('addResource.dropzone.supportedFormats')}</p>
                  </div>
                )}
              </div>
            ) : (
              /* Remote Mode: URL Input */
              <div className="space-y-2">
                <Label htmlFor="add-resource-remote-url">{t('addResource.remoteUrl')}</Label>
                <Input
                  id="add-resource-remote-url"
                  placeholder={t('addResource.remoteUrl.placeholder')}
                  value={remoteUrl}
                  onChange={(e) => setRemoteUrl(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">{t('addResource.remoteUrl.hint')}</p>
              </div>
            )}

            {/* Upload Progress / Processing / Result */}
            {phase === 'uploading' && (
              <div className="space-y-2">
                <Progress value={uploadProgress}>
                  <span className="text-sm text-muted-foreground">
                    {t('addResource.upload.progress', { progress: uploadProgress })}
                  </span>
                </Progress>
              </div>
            )}

            {phase === 'processing' && (
              <div className="space-y-2">
                <Progress value={100} />
                <div className="flex items-center gap-2">
                  <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {t('addResource.upload.processing')}
                  </p>
                </div>
              </div>
            )}

            {phase === 'done' && (
              <div className="space-y-3 rounded-lg border border-border/50 bg-muted/10 p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-green-600 dark:text-green-400">
                  <CheckCircle2 className="size-4" />
                  {t('addResource.result.success')}
                </div>

                {skippedFiles.length > 0 && (
                  <Collapsible>
                    <CollapsibleTrigger className="flex items-center gap-1 text-sm text-amber-600 dark:text-amber-400 hover:underline">
                      <AlertTriangle className="size-4" />
                      {t('addResource.result.skippedFiles', { count: skippedFiles.length })}
                      <ChevronRight className="size-3" />
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                        {skippedFiles.map((file) => (
                          <li key={file} className="truncate">• {file}</li>
                        ))}
                      </ul>
                    </CollapsibleContent>
                  </Collapsible>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={resetUploadState}
                >
                  {t('addResource.continueUpload')}
                </Button>
              </div>
            )}

            {/* Advanced Options */}
            <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
              <CollapsibleTrigger className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
                <ChevronRight
                  className={`size-4 transition-transform ${advancedOpen ? 'rotate-90' : ''}`}
                />
                {t('addResource.advancedOptions')}
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-3 space-y-4 rounded-lg border border-border/50 bg-muted/10 p-4">
                  {/* Parent URI */}
                  <div className="space-y-2">
                    <Label htmlFor="add-resource-parent">{t('addResource.parentUri')}</Label>
                    <div className="flex gap-2">
                      <Input
                        id="add-resource-parent"
                        placeholder="viking://resources/"
                        value={parentUri}
                        onChange={(event) => setParentUri(event.target.value)}
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                        onClick={() => setDirPickerOpen(true)}
                      >
                        <FolderOpen className="mr-1.5 size-4" />
                        {t('addResource.parentUri.browse')}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">{t('addResource.parentUri.hint')}</p>
                  </div>

                  {/* Checkboxes */}
                  <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                    <Label className="flex items-center gap-2">
                      <Checkbox checked={directlyUploadMedia} onCheckedChange={(checked) => setDirectlyUploadMedia(Boolean(checked))} />
                      <span>{t('addResource.directlyUploadMedia')}</span>
                    </Label>
                  </div>
                  <p className="text-xs text-muted-foreground">{t('addResource.directlyUploadMedia.hint')}</p>

                  {/* Reason */}
                  <div className="space-y-2">
                    <Label htmlFor="add-resource-reason">{t('addResource.reason')}</Label>
                    <Textarea
                      id="add-resource-reason"
                      placeholder={t('addResource.reason.placeholder')}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </div>

                  {/* Instruction */}
                  <div className="space-y-2">
                    <Label htmlFor="add-resource-instruction">{t('addResource.instruction')}</Label>
                    <Textarea
                      id="add-resource-instruction"
                      placeholder={t('addResource.instruction.placeholder')}
                      value={instruction}
                      onChange={(e) => setInstruction(e.target.value)}
                    />
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>

            {phase === 'idle' && (
              <Button
                onClick={() => addResourceMutation.mutate()}
                disabled={!canSubmit || addResourceMutation.isPending}
              >
                {addResourceMutation.isPending
                  ? t('addResource.uploading')
                  : mode === 'upload'
                    ? t('addResource.upload')
                    : t('addResource.submit')}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      <DirectoryPickerDialog
        open={dirPickerOpen}
        onOpenChange={setDirPickerOpen}
        value={parentUri}
        onSelect={setParentUri}
      />
    </LegacyPageShell>
  )
}
