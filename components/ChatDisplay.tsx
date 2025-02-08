"use client"

import type React from "react"
import { useEffect, useRef, useState, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import VideoPlayer from "./VideoPlayer"
import { cn } from "@/lib/utils"
import UploadForm from "./UploadForm"
import { v4 as uuidv4 } from "uuid"
import PromptPopup from "./PromptPopup"
import DeleteVideoPopup from "./DeleteVideoPopup"
import { ToastContainer, toast } from "react-toastify"
import "react-toastify/dist/ReactToastify.css"

const ThinkingDots: React.FC = () => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex items-center space-x-2 text-white text-lg font-mono mb-8 md:mb-12"
    >
      <span>Pensando</span>
      <motion.span
        animate={{
          opacity: [0, 1, 0],
        }}
        transition={{
          duration: 1.5,
          repeat: Number.POSITIVE_INFINITY,
          repeatType: "loop",
        }}
      >
        ...
      </motion.span>
    </motion.div>
  )
}

interface Message {
  role: "user" | "assistant"
  content: string
  id: string
}

interface ChatDisplayProps {
  messages: Message[]
  onUserInteraction: () => void
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>
  isThinking?: boolean
}

const ChatDisplay: React.FC<ChatDisplayProps> = ({ messages, onUserInteraction, setMessages, isThinking = false }) => {
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [lastUserMessageId, setLastUserMessageId] = useState<string | null>(null)
  const [showUploadForm, setShowUploadForm] = useState(false)
  const [showPromptPopup, setShowPromptPopup] = useState(false)
  const [showDeleteVideoPopup, setShowDeleteVideoPopup] = useState(false)
  const [streamingMessage, setStreamingMessage] = useState<Message | null>(null)

  const openDeleteVideoPopup = useCallback(() => {
    setShowDeleteVideoPopup(true)
  }, [])

  const handlePromptCommand = useCallback((content: string) => {
    const lowercaseContent = content.trim().toLowerCase()
    if (lowercaseContent.startsWith("/promptcacilda")) {
      return "prompt"
    } else if (lowercaseContent.startsWith("/deletecacilda")) {
      return "delete"
    }
    return null
  }, [])

  const handlePromptSubmit = async (type: string, content: string) => {
    try {
      const response = await fetch("/api/update-knowledge-base", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ type, content }),
      })

      if (!response.ok) {
        throw new Error("Falha ao atualizar a base de conhecimento")
      }

      const result = await response.json()

      setShowPromptPopup(false)
      setMessages((prev) => [...prev, { role: "assistant", content: result.message, id: uuidv4() }])
    } catch (error) {
      console.error("Erro ao atualizar a base de conhecimento:", error)
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Ocorreu um erro ao atualizar a base de conhecimento. Por favor, tente novamente.",
          id: uuidv4(),
        },
      ])
    }
  }

  useEffect(() => {
    const handleScroll = () => {
      if (messagesContainerRef.current) {
        const { scrollHeight, clientHeight, scrollTop } = messagesContainerRef.current
        setIsAtBottom(scrollHeight - clientHeight <= scrollTop + 1)
      }
    }

    const messagesContainer = messagesContainerRef.current
    if (messagesContainer) {
      messagesContainer.addEventListener("scroll", handleScroll)
      return () => messagesContainer.removeEventListener("scroll", handleScroll)
    }
  }, [])

  useEffect(() => {
    if (messages.length > 0) {
      onUserInteraction()
    }

    const lastUserMessage = [...messages].reverse().find((msg) => msg.role === "user")
    if (lastUserMessage && lastUserMessage.id !== lastUserMessageId) {
      setLastUserMessageId(lastUserMessage.id)
      const command = handlePromptCommand(lastUserMessage.content)
      if (command === "prompt") {
        setShowPromptPopup(true)
      } else if (command === "delete") {
        openDeleteVideoPopup()
      } else {
        const userMessageElement = document.getElementById(lastUserMessage.id)
        if (userMessageElement) {
          userMessageElement.scrollIntoView({ behavior: "smooth", block: "start" })
        }
      }
    }
  }, [messages, onUserInteraction, lastUserMessageId, handlePromptCommand, openDeleteVideoPopup])

  useEffect(() => {
    const lastMessage = messages[messages.length - 1]
    if (
      lastMessage &&
      lastMessage.role === "user" &&
      lastMessage.content.trim().toLowerCase().startsWith("/uploadcacilda")
    ) {
      setShowUploadForm(true)
    }
  }, [messages])

  const handleUploadSubmit = useCallback(
    async (data: {
      client: string
      title: string
      production: string
      creation: string
      category: string
      description: string
      vimeoLink: string
    }) => {
      try {
        const response = await fetch("/api/upload-video", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(data),
        })

        if (response.ok) {
          toast.success("Vídeo adicionado com sucesso!")
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: "Vídeo adicionado com sucesso!", id: uuidv4() },
          ])
        } else {
          throw new Error("Falha ao adicionar o vídeo")
        }
      } catch (error) {
        console.error("Erro ao enviar o formulário:", error)
        toast.error("Ocorreu um erro ao adicionar o vídeo. Por favor, tente novamente.")
      }
    },
    [setMessages],
  )

  const handleDeleteVideo = async (id: number) => {
    try {
      const response = await fetch("/api/delete-video", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id }),
      })

      if (!response.ok) {
        throw new Error("Falha ao deletar o vídeo")
      }

      toast.success("Vídeo deletado com sucesso!")
    } catch (error) {
      console.error("Erro ao deletar o vídeo:", error)
      toast.error("Ocorreu um erro ao deletar o vídeo. Por favor, tente novamente.")
    } finally {
      setShowDeleteVideoPopup(false)
    }
  }

  const renderMessageContent = useCallback((content: string) => {
    if (content.trim().toLowerCase().startsWith("/promptcacilda")) {
      return null
    }
    const parts = content.split(/(\[highlight\].*?\[\/highlight\]|\[portfolio=.*?\]|\[contact\]|\[more_videos\])/g)
    return parts.map((part, i) => {
      if (part.trim().toLowerCase().startsWith("/uploadcacilda")) {
        return <p key={i}>Abrindo formulário para adicionar novo vídeo...</p>
      } else if (part.startsWith("[highlight]") && part.endsWith("[/highlight]")) {
        return <ScriptText key={i} text={part.slice(11, -12)} />
      } else if (part.startsWith("[portfolio=") && part.endsWith("]")) {
        const videoId = part.slice(11, -1)
        return (
          <div key={i} className="my-4 sm:my-6 md:my-8 w-full">
            <VideoPlayer videoId={videoId} />
          </div>
        )
      } else if (part === "[contact]") {
        return (
          <p key={i} className="mt-2 text-green-400">
            Para contato: atendimento@cacildafilmes.com ou digite /whatsapp + seu número (ex: /whatsapp11987654321)
          </p>
        )
      } else if (part === "[more_videos]") {
        return (
          <p key={i} className="mt-2 text-blue-400">
            Gostaria de ver mais vídeos do nosso portfólio?
          </p>
        )
      } else {
        return <ScriptText key={i} text={part} />
      }
    })
  }, [])

  useEffect(() => {
    if (streamingMessage) {
      setMessages((prevMessages) => {
        const lastMessage = prevMessages[prevMessages.length - 1]
        if (lastMessage && lastMessage.id === streamingMessage.id) {
          return [...prevMessages.slice(0, -1), streamingMessage]
        } else {
          return [...prevMessages, streamingMessage]
        }
      })
    }
  }, [streamingMessage, setMessages])

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-auto bg-black">
      <div
        ref={messagesContainerRef}
        className="h-full overflow-y-auto p-3 sm:p-4 md:p-6 lg:p-8 pb-20"
        style={{ maxHeight: "calc(100vh - 180px)" }}
      >
        <div className="max-w-4xl mx-auto">
          <AnimatePresence initial={false}>
            {messages.map((message) => (
              <motion.div
                key={message.id}
                id={message.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className={`mb-8 md:mb-12 ${message.role === "user" ? "pl-4 sm:pl-8 md:pl-16" : ""}`}
              >
                {message.role === "user" && (
                  <div className="uppercase text-white mb-2 tracking-wider text-sm sm:text-base">VOCÊ:</div>
                )}
                {message.role === "assistant" && (
                  <div className="uppercase text-white mb-2 tracking-wider text-sm sm:text-base">CACILDA:</div>
                )}
                <div className="leading-relaxed text-base sm:text-lg text-white font-sans">
                  {renderMessageContent(message.content)}
                </div>
              </motion.div>
            ))}
            {streamingMessage && (
              <motion.div
                key={streamingMessage.id}
                id={streamingMessage.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="mb-8 md:mb-12"
              >
                <div className="uppercase text-white mb-2 tracking-wider text-sm sm:text-base">CACILDA:</div>
                <div className="leading-relaxed text-base sm:text-lg text-white font-sans">
                  {renderMessageContent(streamingMessage.content)}
                </div>
              </motion.div>
            )}
            {isThinking && <ThinkingDots />}
          </AnimatePresence>
        </div>
      </div>
      {!isAtBottom && (
        <motion.div
          className="fixed bottom-32 left-1/2 transform -translate-x-1/2 z-[9999]"
          initial={{ opacity: 0.5, y: 0 }}
          animate={{ opacity: 1, y: [0, -5, 0] }}
          transition={{ repeat: Number.POSITIVE_INFINITY, duration: 1.5, ease: "easeInOut" }}
        >
          <button
            onClick={() => {
              messagesContainerRef.current?.scrollTo({
                top: messagesContainerRef.current.scrollHeight,
                behavior: "smooth",
              })
            }}
            className="bg-white bg-opacity-20 text-white hover:bg-opacity-40 rounded-full p-3 transition-colors duration-200"
            aria-label="Rolar para baixo"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-8 w-8"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </button>
        </motion.div>
      )}
      {showUploadForm && <UploadForm onSubmit={handleUploadSubmit} onClose={() => setShowUploadForm(false)} />}
      {showPromptPopup && <PromptPopup onSubmit={handlePromptSubmit} onClose={() => setShowPromptPopup(false)} />}
      {showDeleteVideoPopup && (
        <DeleteVideoPopup onDelete={handleDeleteVideo} onClose={() => setShowDeleteVideoPopup(false)} />
      )}
      <ToastContainer
        position="bottom-right"
        autoClose={3000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
      />
    </div>
  )
}

const SceneHeading: React.FC<{ text: string }> = ({ text }) => {
  return (
    <motion.h2
      className="uppercase text-xl sm:text-2xl md:text-3xl font-bold mb-4 tracking-widest text-white"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      {text}
    </motion.h2>
  )
}

const ScriptText: React.FC<{ text: string }> = ({ text }) => {
  const words = text.split(" ")

  return (
    <p className="mb-4 font-sans text-base sm:text-lg leading-relaxed">
      {words.map((word, index) => {
        const isHighlighted = word.startsWith("[highlight]") && word.endsWith("[/highlight]")
        const cleanWord = word.replace(/\[highlight\]|\[\/highlight\]/g, "")
        return (
          <motion.span
            key={index}
            className={cn("inline-block mr-1 text-white", isHighlighted && "bg-green-500 text-black px-1 rounded")}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.05, delay: index * 0.05 }}
          >
            {cleanWord}
          </motion.span>
        )
      })}
    </p>
  )
}

export default ChatDisplay

