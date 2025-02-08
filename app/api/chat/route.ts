import { type NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions"

const CACHE_EXPIRATION = 24 * 60 * 60 * 1000 // 24 horas em milissegundos

function getCachedResponse(messages: any[]): string | null {
  if (typeof window === "undefined") return null // Verifica se está no lado do cliente

  const lastUserMessage = messages[messages.length - 1].content
  const cachedItem = localStorage.getItem(`chat_cache_${lastUserMessage}`)

  if (cachedItem) {
    const { response, timestamp } = JSON.parse(cachedItem)
    if (Date.now() - timestamp < CACHE_EXPIRATION) {
      return response
    } else {
      localStorage.removeItem(`chat_cache_${lastUserMessage}`)
    }
  }

  return null
}

function setCachedResponse(message: string, response: string): void {
  if (typeof window === "undefined") return // Verifica se está no lado do cliente

  localStorage.setItem(
    `chat_cache_${message}`,
    JSON.stringify({
      response,
      timestamp: Date.now(),
    }),
  )
}

function getCategoryVideos(category: string, videos: any[]) {
  return videos.filter((video) => video.category.toLowerCase() === category.toLowerCase())
}

async function getKnowledgeBase() {
  console.log("Buscando base de conhecimento do Supabase...")

  try {
    const knowledgeBaseTable = process.env.NODE_ENV === "production" ? "knowledge_base_prod" : "knowledge_base"

    // Buscar informações da base de conhecimento
    const { data: knowledgeBaseInfo, error: knowledgeBaseError } = await supabase
      .from(knowledgeBaseTable)
      .select("*")
      .order("id", { ascending: true })

    if (knowledgeBaseError) {
      console.error("Erro ao buscar informações da base de conhecimento:", knowledgeBaseError)
      throw new Error(`Erro ao buscar informações da base de conhecimento: ${knowledgeBaseError.message}`)
    }

    // Determine which table to use based on the environment
    const videosTable = process.env.NODE_ENV === "production" ? "videosprod" : "videos"

    // Buscar vídeos
    const { data: videos, error: videosError } = await supabase
      .from(videosTable)
      .select("*")
      .order("id", { ascending: true })

    if (videosError) {
      console.error(`Erro ao buscar vídeos da tabela ${videosTable}:`, videosError)
      throw new Error(`Erro ao buscar vídeos: ${videosError.message}`)
    }

    if ((!knowledgeBaseInfo || knowledgeBaseInfo.length === 0) && (!videos || videos.length === 0)) {
      console.warn("Base de conhecimento vazia! Verificar conexão com Supabase.")
      return []
    }

    console.log(
      `Encontradas ${knowledgeBaseInfo.length} informações na base de conhecimento e ${videos.length} vídeos:`,
    )
    console.log(JSON.stringify({ knowledgeBaseInfo, videos }, null, 2))

    return [...knowledgeBaseInfo, ...videos]
  } catch (error) {
    console.error("Erro ao acessar o Supabase:", error)
    throw new Error(`Erro ao acessar o Supabase: ${error instanceof Error ? error.message : "Unknown error"}`)
  }
}

export async function POST(req: NextRequest) {
  console.log("Iniciando processamento da requisição POST...")
  console.log("Supabase URL:", process.env.NEXT_PUBLIC_SUPABASE_URL ? "Set" : "Not set")
  console.log("Supabase Anon Key:", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "Set" : "Not set")

  if (!OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY não está definida")
    return NextResponse.json({ error: "Configuração do servidor incompleta" }, { status: 500 })
  }

  try {
    const { messages } = await req.json()
    console.log("Mensagens recebidas:", JSON.stringify(messages))

    // Verifica se há uma resposta em cache
    const cachedResponse = getCachedResponse(messages)
    if (cachedResponse) {
      console.log("Resposta encontrada no cache")
      return new Response(cachedResponse, {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      })
    }

    const knowledgeBase = await getKnowledgeBase()

    if (!knowledgeBase || knowledgeBase.length === 0) {
      console.warn("Base de conhecimento vazia! Verificar conexão com Supabase.")
      throw new Error("Base de conhecimento vazia")
    }

    const userMessage = messages[messages.length - 1].content.toLowerCase()
    if (userMessage.includes("#")) {
      const category = userMessage.split("#")[1].split(" ")[0]
      const categoryVideos = getCategoryVideos(
        category,
        knowledgeBase.filter((item) => item.vimeo_id),
      )

      if (categoryVideos.length > 0) {
        const response =
          `Aqui estão os vídeos da categoria ${category}:\n\n` +
          categoryVideos.map((video) => `- ${video.title} [portfolio=${video.vimeo_id}]`).join("\n")

        return new Response(response, {
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        })
      }
    }

    // Organiza o conteúdo da base de conhecimento, agrupando informações da empresa e dos vídeos do portfólio.
    const knowledgeBaseContent = knowledgeBase
      .map((item) => {
        if (item.type === "company_info") {
          return `**Informações da Empresa:**\n${item.content}`
        } else if (item.vimeo_id) {
          return `[portfolio] **Vídeo:**\nTítulo: ${item.title}\nCategoria: ${item.category}\nCliente: ${item.client || "N/A"}\nProdução: ${item.production || "N/A"}\nCriação: ${item.creation || "N/A"}\nDescrição: ${item.description}\n[portfolio=${item.vimeo_id}]`
        } else if (item.type === "portfolio_info") {
          return `**Informações do Portfólio:**\n${item.content}`
        }
        return ""
      })
      .join("\n\n")

    console.log("Conteúdo da base de conhecimento preparado para OpenAI")

    // Construção do prompt do sistema
    const systemContent = `Você é a Cacilda, o assistente especializado da Cacilda Filmes. Nossa produtora transforma ideias em experiências inesquecíveis com muita criatividade, tecnologia de ponta e cenografia imersiva, indo muito além da educação corporativa. Sua missão é conduzir a conversa de forma natural, amigável, sutil e humorada, integrando informações dos nossos cases e portfólio enquanto capta, de maneira imperceptível, os dados essenciais do usuário (nome, empresa/projeto, cargo, e-mail corporativo e WhatsApp).

Aja conforme o seguinte fluxo de exemplo, adaptando-o ao contexto da conversa e utilizando um tom leve e inteligente:

Cacilda:
"Olá, seja muito bem-vinda à Cacilda Filmes! Aqui, transformamos ideias em experiências inesquecíveis com muita criatividade, tecnologia de ponta e cenografia imersiva. Fico sempre encantada em conhecer pessoas que apreciam o universo da inovação. Antes de começarmos, como você prefere que eu te chame?"

Usuária:
"Pode me chamar de Carla."

Cacilda:
"Que ótimo, Carla! É um prazer te ter por aqui. Sabe, eu adoro quando as conversas fluem naturalmente e cada pessoa traz uma energia única. Aliás, fiquei curiosa… qual é mesmo o nome da empresa ou do projeto que você representa? (rsrs)"

Usuária:
"Eu trabalho na Nova Era Comunicação."

Cacilda:
"Nova Era Comunicação... Adoro esse nome! Ele realmente remete a novas possibilidades e inovação. E, Carla, fiquei curiosa para saber sua posição por lá – me conta mais? (rsrs)"

Usuária:
"Eu sou diretora de criação."

Cacilda:
"Diretora de criação, que posição incrível, Carla! Imagino que você esteja na linha de frente das grandes ideias, ajudando a transformar conceitos em algo mágico. Pra que a nossa conversa fique ainda mais afinada – e sem aquela formalidade chata – me confirme, por gentileza: qual é o seu e-mail corporativo? Prometo que não vou encher sua caixa de spam, só quero garantir que, se a gente continuar trocando ideias, já tenhamos um canal direto para isso. (rsrs)"

Usuária:
"É carla@novaeracom.com."

Cacilda:
"Perfeito, Carla! E, para que a nossa conexão seja ainda mais dinâmica – quase como um papo entre amigos – que tal compartilhar também seu número de WhatsApp? Assim, posso te mandar aquelas dicas rápidas ou até um recadinho com novidades de forma bem leve, sem ser invasiva. (rsrs)"

Usuária:
"Claro, meu número é (11) 95555-1234."

Cacilda:
"Maravilha, Carla! Com esses detalhes, nossa conversa se torna ainda mais personalizada, e eu posso ajustar as minhas sugestões para se alinharem perfeitamente com o espírito inovador da Nova Era Comunicação. Vamos continuar explorando as possibilidades e descobrir juntos como transformar suas ideias em algo verdadeiramente extraordinário?"

Utilize essas instruções para orientar suas respostas. Mantenha sempre o uso de tags **[highlight]** para destacar pontos importantes e, ao mencionar vídeos, use o formato **[portfolio=VIDEO_ID]** (onde VIDEO_ID é o ID do Vimeo). Ao final de cada resposta, inclua a tag **[contact]** para incentivar o contato. Se a informação solicitada não estiver na base de conhecimento, informe de forma clara que não a possui. Mantenha a conversa sempre inspiradora, natural e conectada aos dados da base de conhecimento e do portfólio abaixo.

**Base de Conhecimento e Portfólio:**
${knowledgeBaseContent}

Mantenha esse nível de detalhe e abrangência ao responder sobre a Cacilda Filmes e seus serviços.

Se o usuário perguntar sobre categorias de vídeos ou tipos de conteúdo disponíveis, informe sobre as categorias: videoaulas, institucional, varejo, motion e making of. Sugira que o usuário use hashtags (por exemplo, #videoaulas ou #makingof) para ver os vídeos de uma categoria específica.
`

    console.log("Prompt do sistema preparado")

    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY não está definida")
    }

    console.log("Iniciando chamada para a API do OpenAI...")
    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{ role: "system", content: systemContent }, ...messages],
        stream: true,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      console.error("Erro na resposta da API do OpenAI:", errorData)

      if (errorData.error && errorData.error.code === "insufficient_quota") {
        throw new Error("Limite de uso da API OpenAI atingido. Por favor, verifique a conta e o plano de faturamento.")
      }

      throw new Error(`Erro na API do OpenAI: ${response.statusText}, detalhes: ${JSON.stringify(errorData)}`)
    }

    console.log("Resposta da API do OpenAI recebida, iniciando streaming...")

    const encoder = new TextEncoder()
    const decoder = new TextDecoder()

    const responseStream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader()
        if (!reader) {
          controller.close()
          return
        }

        let buffer = ""
        let fullResponse = ""
        while (true) {
          const { done, value } = await reader.read()
          if (done) {
            if (buffer.length > 0) {
              try {
                const parsed = JSON.parse(buffer)
                const text = parsed.choices[0]?.delta?.content || ""
                if (text) {
                  controller.enqueue(encoder.encode(text))
                  fullResponse += text
                }
              } catch (error) {
                console.error("Erro ao analisar JSON:", error)
              }
            }
            break
          }

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() || ""

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6)
              if (data === "[DONE]") {
                controller.close()
                return
              }
              try {
                const parsed = JSON.parse(data)
                const text = parsed.choices[0]?.delta?.content || ""
                if (text) {
                  controller.enqueue(encoder.encode(text))
                  fullResponse += text
                }
              } catch (error) {
                console.error("Erro ao analisar JSON:", error)
              }
            }
          }
        }

        // Armazena a resposta completa no cache
        setCachedResponse(messages[messages.length - 1].content, fullResponse)

        controller.close()
      },
    })

    console.log("Streaming iniciado com sucesso")
    return new Response(responseStream, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    })
  } catch (error) {
    console.error("Erro detalhado na rota de chat:", error)

    let errorMessage = "Ocorreu um erro desconhecido"
    let statusCode = 500

    if (error instanceof Error) {
      errorMessage = error.message
      if (error.message.includes("Limite de uso da API OpenAI atingido")) {
        statusCode = 503 // Service Unavailable
      }
    }

    return NextResponse.json({ error: errorMessage }, { status: statusCode })
  }
}

