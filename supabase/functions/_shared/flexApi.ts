const FLEX_BASE = 'https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService'

function parseFlexXml(text: string): Record<string, string> {
  const result: Record<string, string> = {}
  const tagRegex = /<(\w+)>([^<]*)<\/\1>/g
  let match: RegExpExecArray | null
  while ((match = tagRegex.exec(text)) !== null) {
    result[match[1]] = match[2]
  }
  return result
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

export async function fetchIbkrFlexCsv(token: string, queryId: string): Promise<string> {
  const sendUrl =
    `${FLEX_BASE}/SendRequest?t=${encodeURIComponent(token)}&q=${encodeURIComponent(queryId)}&v=3`

  const sendRes = await fetch(sendUrl)
  const sendText = await sendRes.text()
  const sendParsed = parseFlexXml(sendText)

  if (sendParsed.Status !== 'Success' || !sendParsed.ReferenceCode) {
    const msg = sendParsed.ErrorMessage || sendText.slice(0, 300)
    throw new Error(`IBKR SendRequest 失败：${msg}`)
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
      if (parsed.ErrorCode === '1019' || body.includes('in progress')) {
        await sleep(2000)
        continue
      }
      throw new Error(`IBKR GetStatement 失败：${parsed.ErrorMessage || body.slice(0, 300)}`)
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
