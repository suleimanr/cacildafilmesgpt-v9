import type React from "react"
import { useState, useEffect } from "react"
import WaveformIcon from "./WaveformIcon"

interface OpenAIAssistantProps {
  onMessageSent: (message: string) => void
  onToggleCall: () => void
  isCallActive: boolean
  onInputChange: (input: string) => void
  hashtagSuggestions: string[]
}

const OpenAIAssistant: React.FC<OpenAIAssistantProps> = ({
  onMessageSent,
  onToggleCall,
  isCallActive,
  onInputChange,
  hashtagSuggestions,
}) => {
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [placeholderIndex, setPlaceholderIndex] = useState(0)

  const placeholders = [
    "Pergunte sobre nossos serviços...",
    "Quer saber mais sobre nosso portfólio?",
    "Conheça nossos trabalhos...",
    "Veja nossos vídeos...",
    "Entre em contato conosco...",
  ]

  useEffect(() => {
    const intervalId = setInterval(() => {
      setPlaceholderIndex((prevIndex) => (prevIndex + 1) % placeholders.length)
    }, 3000) // Muda a cada 3 segundos

    return () => clearInterval(intervalId)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return

    setIsLoading(true)
    onMessageSent(input)
    setInput("")
    setIsLoading(false)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value)
    onInputChange(e.target.value)
  }

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="flex items-center border-2 border-white overflow-hidden bg-black rounded-full max-w-xl mx-auto relative">
        <input
          type="text"
          value={input}
          onChange={handleInputChange}
          placeholder={placeholders[placeholderIndex]}
          className="appearance-none bg-transparent border-none flex-grow text-white px-4 py-1 leading-tight focus:outline-none text-sm font-mono placeholder-gray-500 h-8"
          disabled={isLoading}
        />
        {hashtagSuggestions.length > 0 && (
          <div className="absolute bottom-full left-0 bg-gray-800 rounded-md p-2 mb-1">
            {hashtagSuggestions.map((hashtag) => (
              <button
                key={hashtag}
                type="button"
                onClick={() => setInput(input + hashtag.slice(1))}
                className="block text-white hover:bg-gray-700 px-2 py-1 rounded"
              >
                {hashtag}
              </button>
            ))}
          </div>
        )}
        <button
          type="submit"
          className="bg-transparent hover:bg-gray-200 text-white hover:text-black text-xs py-1 px-3 transition-colors duration-200 font-mono uppercase rounded-full"
          disabled={isLoading}
        >
          {isLoading ? "..." : "Ação"}
        </button>
        <button
          type="button"
          onClick={onToggleCall}
          className="flex-shrink-0 bg-white hover:bg-gray-200 text-black w-8 h-8 flex items-center justify-center transition-colors duration-200 rounded-full"
        >
          <WaveformIcon isActive={isCallActive} />
        </button>
      </div>
    </form>
  )
}

export default OpenAIAssistant

