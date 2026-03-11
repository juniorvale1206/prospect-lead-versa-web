/**
 * lib/services/asaas.service.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Integração com a API Asaas — Transferências Pix para Promotores/Frentistas
 *
 * DOCUMENTAÇÃO OFICIAL:
 *   https://docs.asaas.com/reference/realizar-transferencia
 *   POST https://api.asaas.com/v3/transfers
 *
 * AUTENTICAÇÃO:
 *   Header: access_token: $ASAAS_API_KEY
 *   Sandbox: $ASAAS_SANDBOX=true → usa sandbox.asaas.com
 *
 * AMBIENTE:
 *   .env:
 *     ASAAS_API_KEY=your_api_key_here
 *     ASAAS_SANDBOX=true              # false em produção
 *     ASAAS_WALLET_ID=                # opcional: ID da carteira Asaas a débitar
 *
 * INFERÊNCIA DO TIPO DE CHAVE PIX:
 *   CPF        → 11 dígitos ou formato 000.000.000-00
 *   CNPJ       → 14 dígitos ou formato 00.000.000/0000-00
 *   EMAIL      → contém @
 *   PHONE      → começa com + ou tem 11-13 dígitos numéricos
 *   EVP        → formato UUID (chave aleatória)
 *
 * CICLO DE VIDA DE UMA TRANSFERÊNCIA:
 *   PENDING    → agendada (pode ser em horário fora do horário bancário)
 *   DONE       → concluída com sucesso
 *   CANCELLED  → cancelada (ex: saldo insuficiente)
 *   FAILED     → falha técnica
 *
 * LIMITES ASAAS (conta verificada):
 *   Máximo por transferência Pix: R$ 10.000
 *   Horário Pix: 24h/7 dias (instantâneo para a maioria dos bancos)
 */

// ─── Tipos de resposta da API Asaas ──────────────────────────────────────────

export interface AsaasTransferRequest {
  value:               number   // valor em R$ (ex: 150.00)
  pixAddressKey:       string   // a chave Pix do beneficiário
  pixAddressKeyType:   AsaasPixKeyType
  description?:        string   // descrição visível no extrato (max 50 chars)
  scheduleDate?:       string   // data ISO para agendamento (opcional)
  walletId?:           string   // ID da carteira Asaas a débitar (opcional)
}

export type AsaasPixKeyType = 'CPF' | 'CNPJ' | 'EMAIL' | 'PHONE' | 'EVP'

export type AsaasTransferStatus =
  | 'PENDING'
  | 'BANK_PROCESSING'
  | 'DONE'
  | 'CANCELLED'
  | 'FAILED'

export interface AsaasTransferResponse {
  id:              string                // ID da transferência no Asaas
  object:          'transfer'
  dateCreated:     string
  status:          AsaasTransferStatus
  effectiveDate:   string | null
  endToEndIdentifier: string | null      // identificador único Pix (E2E ID)
  value:           number
  netValue:        number
  description:     string
  pixAddressKey:   string
  pixAddressKeyType: AsaasPixKeyType
  failReason:      string | null
}

export interface AsaasError {
  errors: Array<{
    code:        string  // ex: "transfer.pixAddressKey.invalid"
    description: string  // ex: "Chave PIX inválida."
  }>
}

// ─── Erro tipado do serviço ───────────────────────────────────────────────────

export class AsaasServiceError extends Error {
  constructor(
    public readonly code:       string,
    message:                    string,
    public readonly httpStatus: number = 400,
    public readonly asaasErrors?: AsaasError['errors'],
  ) {
    super(message)
    this.name = 'AsaasServiceError'
  }
}

// ─── Configuração da API ──────────────────────────────────────────────────────

function getBaseUrl(): string {
  const isSandbox = process.env.ASAAS_SANDBOX !== 'false'
  return isSandbox
    ? 'https://sandbox.asaas.com/api/v3'
    : 'https://api.asaas.com/v3'
}

function getApiKey(): string {
  const key = process.env.ASAAS_API_KEY
  if (!key || key.trim() === '') {
    throw new AsaasServiceError(
      'ASAAS_NOT_CONFIGURED',
      'ASAAS_API_KEY não configurada. Configure no .env ou nas variáveis de ambiente.',
      503,
    )
  }
  return key.trim()
}

// ─── Inferência automática do tipo de chave Pix ──────────────────────────────
//
//  Lógica de detecção (ordem de prioridade):
//    1. EMAIL    → contém "@" (mais específico)
//    2. CPF      → 11 dígitos numéricos (ou formato 000.000.000-00)
//    3. CNPJ     → 14 dígitos numéricos (ou formato 00.000.000/0000-00)
//    4. PHONE    → começa com "+" ou tem 10-13 dígitos (DDI+DDD+número)
//    5. EVP      → formato UUID v4 (chave aleatória)
//    6. Fallback → EVP (para chaves não reconhecidas)
//
// ─────────────────────────────────────────────────────────────────────────────

export function inferPixKeyType(pixKey: string): AsaasPixKeyType {
  const key = pixKey.trim()

  // 1. Email
  if (key.includes('@')) return 'EMAIL'

  // 2. UUID (chave aleatória / EVP)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (uuidRegex.test(key)) return 'EVP'

  // Remove todos os caracteres não numéricos para verificar CPF/CNPJ/Telefone
  const digits = key.replace(/\D/g, '')

  // 3. CPF → exatamente 11 dígitos
  if (digits.length === 11) return 'CPF'

  // 4. CNPJ → exatamente 14 dígitos
  if (digits.length === 14) return 'CNPJ'

  // 5. Telefone → começa com "+" ou tem 10-13 dígitos
  if (key.startsWith('+') || (digits.length >= 10 && digits.length <= 13)) {
    return 'PHONE'
  }

  // 6. Fallback para chaves não identificadas
  return 'EVP'
}

// ─── Mapear tipo do sistema para tipo Asaas ──────────────────────────────────

export function mapPixKeyType(systemType: string): AsaasPixKeyType {
  const map: Record<string, AsaasPixKeyType> = {
    CPF:       'CPF',
    EMAIL:     'EMAIL',
    TELEFONE:  'PHONE',
    CNPJ:      'CNPJ',
    ALEATORIA: 'EVP',
  }
  return map[systemType?.toUpperCase()] ?? 'EVP'
}

// ─────────────────────────────────────────────────────────────────────────────
// transferPix()
// ─────────────────────────────────────────────────────────────────────────────
//
//  Executa uma transferência Pix via API Asaas.
//
//  Parâmetros:
//    value       — valor em R$ (ex: 150.00)
//    pixKey      — chave Pix do beneficiário (CPF, email, telefone, UUID)
//    description — texto visível no extrato (máx 50 chars, truncado auto)
//    pixKeyType  — tipo da chave (se não fornecido, é inferido automaticamente)
//
//  Retorna:
//    AsaasTransferResponse com id, status, endToEndIdentifier
//
//  Lança:
//    AsaasServiceError com código e mensagem legível
//
// ─────────────────────────────────────────────────────────────────────────────

export async function transferPix(
  value:       number,
  pixKey:      string,
  description: string,
  pixKeyType?: string,   // tipo do sistema (CPF | EMAIL | TELEFONE | CNPJ | ALEATORIA)
): Promise<AsaasTransferResponse> {

  // ── Validações locais (antes de chamar a API) ─────────────────────────────
  if (!value || value <= 0) {
    throw new AsaasServiceError('INVALID_VALUE',
      'Valor da transferência deve ser maior que zero.', 400)
  }
  if (value > 10_000) {
    throw new AsaasServiceError('VALUE_EXCEEDED',
      'Valor máximo por transferência Pix é R$ 10.000,00.', 400)
  }
  if (!pixKey || pixKey.trim().length < 3) {
    throw new AsaasServiceError('INVALID_PIX_KEY',
      'Chave Pix inválida ou não informada.', 400)
  }

  // ── Resolver tipo da chave ────────────────────────────────────────────────
  const resolvedKeyType: AsaasPixKeyType = pixKeyType
    ? mapPixKeyType(pixKeyType)
    : inferPixKeyType(pixKey)

  // ── Preparar payload ──────────────────────────────────────────────────────
  const payload: AsaasTransferRequest = {
    value:              Math.round(value * 100) / 100,   // garantir 2 casas decimais
    pixAddressKey:      pixKey.trim(),
    pixAddressKeyType:  resolvedKeyType,
    description:        description.slice(0, 50),         // Asaas limita a 50 chars
    ...(process.env.ASAAS_WALLET_ID
      ? { walletId: process.env.ASAAS_WALLET_ID }
      : {}),
  }

  const baseUrl = getBaseUrl()
  const apiKey  = getApiKey()

  console.log(
    `[AsaasService] Iniciando transferência Pix | Valor: R$${value} | ` +
    `Chave: ${resolvedKeyType}:${pixKey.slice(0, 6)}... | ` +
    `Sandbox: ${process.env.ASAAS_SANDBOX !== 'false'}`
  )

  // ── Chamada HTTP para o Asaas ─────────────────────────────────────────────
  let response: Response
  try {
    response = await fetch(`${baseUrl}/transfers`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'access_token':  apiKey,
        'User-Agent':    'ProspecLead/1.0',
      },
      body: JSON.stringify(payload),
    })
  } catch (networkErr) {
    const msg = networkErr instanceof Error ? networkErr.message : String(networkErr)
    console.error('[AsaasService] Erro de rede:', msg)
    throw new AsaasServiceError(
      'NETWORK_ERROR',
      `Não foi possível conectar à API Asaas. Verifique a conectividade. (${msg})`,
      503,
    )
  }

  // ── Parse da resposta ─────────────────────────────────────────────────────
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new AsaasServiceError(
      'INVALID_RESPONSE',
      `API Asaas retornou resposta inválida (HTTP ${response.status}).`,
      502,
    )
  }

  // ── Tratar erros HTTP do Asaas ────────────────────────────────────────────
  if (!response.ok) {
    const errBody = body as AsaasError
    const firstError = errBody?.errors?.[0]

    // Mapear códigos de erro do Asaas para mensagens amigáveis em pt-BR
    const friendlyMessage = mapAsaasError(
      firstError?.code ?? '',
      firstError?.description ?? `Erro HTTP ${response.status} da API Asaas.`,
      response.status,
    )

    console.error('[AsaasService] Erro da API:', firstError?.code, firstError?.description)

    throw new AsaasServiceError(
      firstError?.code ?? 'ASAAS_API_ERROR',
      friendlyMessage,
      response.status >= 500 ? 502 : 400,
      errBody?.errors,
    )
  }

  const transfer = body as AsaasTransferResponse

  // ── Verificar se a transferência foi rejeitada (status CANCELLED/FAILED) ──
  if (transfer.status === 'CANCELLED' || transfer.status === 'FAILED') {
    throw new AsaasServiceError(
      `TRANSFER_${transfer.status}`,
      transfer.failReason
        ? `Transferência ${transfer.status === 'CANCELLED' ? 'cancelada' : 'falhou'}: ${transfer.failReason}`
        : `Transferência ${transfer.status === 'CANCELLED' ? 'cancelada' : 'falhou'} pela operadora.`,
      402,
    )
  }

  console.log(
    `[AsaasService] Transferência criada: ID=${transfer.id} | ` +
    `Status=${transfer.status} | E2E=${transfer.endToEndIdentifier ?? 'N/A'}`
  )

  return transfer
}

// ─────────────────────────────────────────────────────────────────────────────
// getTransferStatus()
// ─────────────────────────────────────────────────────────────────────────────
// Consulta o status atual de uma transferência pelo ID Asaas.
// Útil para polling (webhook seria mais adequado em produção).
// ─────────────────────────────────────────────────────────────────────────────

export async function getTransferStatus(
  asaasTransferId: string,
): Promise<AsaasTransferResponse> {
  const baseUrl = getBaseUrl()
  const apiKey  = getApiKey()

  const response = await fetch(`${baseUrl}/transfers/${asaasTransferId}`, {
    headers: {
      'access_token': apiKey,
      'User-Agent':   'ProspecLead/1.0',
    },
  })

  if (!response.ok) {
    throw new AsaasServiceError(
      'TRANSFER_NOT_FOUND',
      `Transferência ${asaasTransferId} não encontrada no Asaas.`,
      404,
    )
  }

  return response.json()
}

// ─────────────────────────────────────────────────────────────────────────────
// getAsaasBalance()
// ─────────────────────────────────────────────────────────────────────────────
// Consulta o saldo disponível na conta Asaas do Tenant.
// ─────────────────────────────────────────────────────────────────────────────

export async function getAsaasBalance(): Promise<{
  balance:          number
  totalBalance:     number
  unavailableBalance: number
}> {
  const baseUrl = getBaseUrl()
  const apiKey  = getApiKey()

  const response = await fetch(`${baseUrl}/finance/balance`, {
    headers: {
      'access_token': apiKey,
      'User-Agent':   'ProspecLead/1.0',
    },
  })

  if (!response.ok) {
    throw new AsaasServiceError('BALANCE_ERROR', 'Não foi possível obter o saldo da conta Asaas.', 502)
  }

  return response.json()
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function mapAsaasError(code: string, description: string, httpStatus: number): string {
  const messages: Record<string, string> = {
    'transfer.pixAddressKey.invalid':          'Chave Pix inválida. Verifique os dados do beneficiário.',
    'transfer.pixAddressKey.notFound':         'Chave Pix não encontrada no sistema bancário.',
    'transfer.value.insufficient.balance':     'Saldo insuficiente na conta Asaas do Tenant.',
    'transfer.value.exceeds.daily.limit':      'Limite diário de transferências Pix atingido.',
    'transfer.value.below.minimum':            'Valor abaixo do mínimo permitido pelo Asaas.',
    'account.not.active':                      'Conta Asaas inativa ou não verificada.',
    'access_token.invalid':                    'Token de acesso Asaas inválido. Verifique ASAAS_API_KEY.',
  }
  return messages[code] ?? description
}
