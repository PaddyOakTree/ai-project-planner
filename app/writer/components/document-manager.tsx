"use client"

import { useState, useEffect } from "react"
import {
  FileText,
  Plus,
  Search,
  MoreVertical,
  Download,
  Copy,
  Trash2,
  Edit,
  Eye,
  Calendar,
  User,
  Folder,
  Clock,
  Save,
  Loader2,
  FileQuestion,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { EmptyState } from "@/components/ui/empty-state"
import { useToast } from "@/hooks/use-toast"
import DocumentService, { Document, CreateDocumentData } from "@/lib/services/document.service"
import { useSafeDOM } from "../hooks/use-safe-dom"
import { useSafeState, useSafeCallback } from "../hooks/use-safe-state"
import { SafeDOMWrapper } from "./safe-dom-wrapper"

interface DocumentManagerProps {
  onDocumentSelect: (document: Document) => void
  onDocumentLoad: (content: string) => void
  currentDocumentId?: string
  className?: string
}

export function DocumentManager({ 
  onDocumentSelect, 
  onDocumentLoad, 
  currentDocumentId,
  className 
}: DocumentManagerProps) {
  const { toast } = useToast()
  const { safeDownload } = useSafeDOM()
  const [documents, setDocuments] = useSafeState<Document[]>([])
  const [loading, setLoading] = useSafeState(true)
  const [searchTerm, setSearchTerm] = useSafeState("")
  const [showCreateDialog, setShowCreateDialog] = useSafeState(false)
  const [newDocument, setNewDocument] = useSafeState({
    title: "",
    content: "",
    document_type: "paper" as const
  })
  const [creating, setCreating] = useSafeState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useSafeState<string | null>(null)
  const documentService = DocumentService.getInstance()

  // Load documents with safe cleanup
  const loadDocuments = useSafeCallback(async () => {
    try {
      setLoading(true)
      const docs = await documentService.getDocuments()
      setDocuments(docs)
    } catch (error) {
      console.error("Error loading documents:", error)
      toast({
        title: "Error",
        description: "Failed to load documents",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  })

  useEffect(() => {
    let isMounted = true

    const loadDocs = async () => {
      if (!isMounted) return
      await loadDocuments()
    }

    loadDocs()

    return () => {
      isMounted = false
    }
  }, [])

  const handleCreateDocument = useSafeCallback(async () => {
    try {
      if (!newDocument.title.trim()) {
        toast({
          title: "Error",
          description: "Please enter a document title",
          variant: "destructive"
        })
        return
      }

      setCreating(true)
      const newDoc = await documentService.createDocument(newDocument)
      setDocuments(prev => [newDoc, ...prev])
      setShowCreateDialog(false)
      setNewDocument({ title: "", content: "", document_type: "paper" as const })
      
      toast({
        title: "Success",
        description: "Document created successfully"
      })
    } catch (error) {
      console.error("Error creating document:", error)
      toast({
        title: "Error",
        description: "Failed to create document",
        variant: "destructive"
      })
    } finally {
      setCreating(false)
    }
  })

  const handleDocumentSelect = useSafeCallback((document: Document) => {
    onDocumentSelect(document)
    onDocumentLoad(document.content)
  })

  const handleDeleteDocument = useSafeCallback(async (documentId: string) => {
    try {
      await documentService.deleteDocument(documentId)
      setDocuments(prev => prev.filter(doc => doc.id !== documentId))
      
      toast({
        title: "Success",
        description: "Document deleted successfully"
      })
    } catch (error) {
      console.error("Error deleting document:", error)
      toast({
        title: "Error",
        description: "Failed to delete document",
        variant: "destructive"
      })
    }
  })

  const handleDuplicateDocument = useSafeCallback(async (document: Document) => {
    try {
      const duplicated = await documentService.duplicateDocument(document.id)
      setDocuments(prev => [duplicated, ...prev])
      
      toast({
        title: "Success",
        description: "Document duplicated successfully"
      })
    } catch (error) {
      console.error("Error duplicating document:", error)
      toast({
        title: "Error",
        description: "Failed to duplicate document",
        variant: "destructive"
      })
    }
  })

  const handleExportDocument = useSafeCallback(async (document: Document, format: 'markdown' | 'pdf' | 'docx') => {
    try {
      const blob = await documentService.exportDocument(document.id, format)
      const filename = `${document.title}.${format}`
      
      safeDownload(blob, filename)
      
      toast({
        title: "Success",
        description: `Document exported as ${format.toUpperCase()}`
      })
    } catch (error) {
      console.error("Error exporting document:", error)
      toast({
        title: "Error",
        description: "Failed to export document",
        variant: "destructive"
      })
    }
  })

  const filteredDocuments = documents.filter(doc =>
    doc.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    doc.content.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const getDocumentTypeColor = (type: string) => {
    switch (type) {
      case 'paper': return 'bg-blue-100 text-blue-800'
      case 'note': return 'bg-green-100 text-green-800'
      case 'summary': return 'bg-purple-100 text-purple-800'
      case 'idea': return 'bg-orange-100 text-orange-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className={className}>
      <SafeDOMWrapper>
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-semibold">Documents</CardTitle>
              <Button
                onClick={() => setShowCreateDialog(true)}
                size="sm"
                className="h-8 px-3"
              >
                <Plus className="w-4 h-4 mr-1" />
                New Document
              </Button>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Search documents..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : filteredDocuments.length === 0 ? (
              <div className="p-8">
                {searchTerm ? (
                  <EmptyState
                    title="No Documents Found"
                    description="Try adjusting your search terms or create a new document."
                    icons={[Search, FileQuestion]}
                    action={{
                      label: "Create New Document",
                      onClick: () => setShowCreateDialog(true)
                    }}
                  />
                ) : (
                  <EmptyState
                    title="No Documents Created"
                    description="Start writing by creating your first document."
                    icons={[FileText, Edit, Plus]}
                    action={{
                      label: "Create Document",
                      onClick: () => setShowCreateDialog(true)
                    }}
                  />
                )}
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {filteredDocuments.map((document) => (
                  <div
                    key={document.id}
                    className={`p-4 border rounded-lg cursor-pointer transition-all hover:bg-gray-50 ${
                      currentDocumentId === document.id ? 'bg-blue-50 border-blue-200' : 'border-gray-200'
                    }`}
                    onClick={() => handleDocumentSelect(document)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2 mb-2">
                          <h3 className="font-medium text-gray-900 truncate">
                            {document.title}
                          </h3>
                          <Badge 
                            variant="outline" 
                            className={`text-xs ${getDocumentTypeColor(document.document_type)}`}
                          >
                            {document.document_type}
                          </Badge>
                        </div>
                        
                        <div className="flex items-center space-x-4 text-xs text-gray-500">
                          <div className="flex items-center space-x-1">
                            <Calendar className="w-3 h-3" />
                            <span>{formatDate(document.updated_at)}</span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <Clock className="w-3 h-3" />
                            <span>{document.content.length} chars</span>
                          </div>
                        </div>
                      </div>

                      <DropdownMenu
                        trigger={
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        }
                      >
                        <DropdownMenuItem onClick={() => handleDocumentSelect(document)}>
                          <Edit className="w-4 h-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDuplicateDocument(document)}>
                          <Copy className="w-4 h-4 mr-2" />
                          Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleExportDocument(document, 'markdown')}>
                          <Download className="w-4 h-4 mr-2" />
                          Export Markdown
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => handleDeleteDocument(document.id)}
                          className="text-red-600"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Create Document Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Document</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Title</label>
                <Input
                  value={newDocument.title}
                  onChange={(e) => setNewDocument(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Enter document title..."
                />
              </div>
              <div>
                <label className="text-sm font-medium">Type</label>
                <select
                  value={newDocument.document_type}
                  onChange={(e) => setNewDocument(prev => ({ ...prev, document_type: e.target.value as any }))}
                  className="w-full p-2 border border-gray-300 rounded-md"
                >
                  <option value="paper">Research Paper</option>
                  <option value="note">Note</option>
                  <option value="summary">Summary</option>
                  <option value="idea">Research Idea</option>
                </select>
              </div>
              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreateDocument}>
                  Create Document
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </SafeDOMWrapper>
    </div>
  )
}
