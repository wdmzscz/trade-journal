const FLEX_BASE = 'https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService'

const FLEX_ERROR_HINTS: Record<string, string> = {
  '1003':
    '报表不可用：请确认 Query ID 正确、查询类型为 Activity Flex（非旧版 Legacy）、日期范围含交易数据，并在 Client Portal 先手动运行一次该查询验证。',
  '1010': '旧版 Legacy Flex Query 已停用，请新建 Activity Flex Query。',
  '1012': 'Token 已过期，请在 IBKR Client Portal 重新 Generate Token。',
  '1014': 'Query ID 无效，可能已删除或填错。',
  '1015': 'Token 无效，请重新生成并保存后再同步。',
  '1016': '账户无效，请确认 Flex Query 绑定了正确账户。',
}

function parseFlexXml(text: string): Record<string, string> {
  const result: Record<string, string> = {}
  const tagRegex = /<(\w+)>([^<]*)<\/\1>/g
  let match: RegExpExecArray | null
  while ((match = tagRegex.exec(text)) !== null) {
    result[match[1]] = match[2]
  }
  return result
}

function formatFlexError(stage: 'SendRequest' | 'GetStatement', parsed: Record<string, string>, raw: string): string {
  const code = parsed.ErrorCode ?? ''
  const msg = parsed.ErrorMessage || raw.slice(0, 300)
  const hint = FLEX_ERROR_HINTS[code]
  if (hint) return `IBKR ${stage} 失败 [${code}]：${msg}。${hint}`
  if (code) return `IBKR ${stage} 失败 [${code}]：${msg}`
  return `IBKR ${stage} 失败：${msg}`
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

const RETRYABLE_ERROR_CODES = new Set([
  '1001', '1004', '1005', '1006', '1007', '1008', '1009', '1018', '1019', '1021',
])

export async function fetchIbkrFlexCsv(token: string, queryId: string): Promise<string> {
  const sendUrl =
    `${FLEX_BASE}/SendRequest?t=${encodeURIComponent(token)}&q=${encodeURIComponent(queryId)}&v=3`

  let sendParsed: Record<string, string> = {}
  for (let attempt = 0; attempt < 3; attempt++) {
    const sendRes = await fetch(sendUrl)
    const sendText = await sendRes.text()
    sendParsed = parseFlexXml(sendText)

    if (sendParsed.Status === 'Success' && sendParsed.ReferenceCode) break

    const code = sendParsed.ErrorCode ?? ''
    if (RETRYABLE_ERROR_CODES.has(code) && attempt < 2) {
      await sleep(2000)
      continue
    }

    throw new Error(formatFlexError('SendRequest', sendParsed, sendText))
  }

  if (sendParsed.Status !== 'Success' || !sendParsed.ReferenceCode) {
    throw new Error(formatFlexError('SendRequest', sendParsed, ''))
  }

  const referenceCode = sendParsed.ReferenceCode
  const getUrl =
    `${FLEX_BASE}/GetStatement?t=${encodeURIComponent(token)}&q=${encodeURIComponent(referenceCode)}&v=3`

  for (let attempt = 0; attempt < 12; attempt++) {
    const getRes = await fetch(getUrl)
    const body = await getRes.text()

    if (body.includes('<FlexStatementResponse')) {
      const parsed = parseFlexXml(body)
      if (parsed.Status === 'Success' && parsed.ReferenceCode) {
        continue
      }
      const code = parsed.ErrorCode ?? ''
      if ((RETRYABLE_ERROR_CODES.has(code) || code === '1019' || body.includes('in progress')) && attempt < 11) {
        await sleep(2000)
        continue
      }
      throw new Error(formatFlexError('GetStatement', parsed, body))
    }

    // Activity Statement 格式（含 section code）或 Flex Query 列式 CSV
    if (
      body.includes('Statement,Header') ||
      body.includes('交易,Header') ||
      body.includes('Trades,Header') ||
      (body.includes('"ClientAccountID"') && body.includes('"Symbol"'))
    ) {
      return body
    }

    await sleep(2000)
  }

  throw new Error('IBKR 报表生成超时，请稍后再试')
}
