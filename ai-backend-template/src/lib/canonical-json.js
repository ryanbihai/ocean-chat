/**
 * @file canonical-json.js
 * @description 确定性 JSON 序列化——用于 Ed25519 签名前后保证相同字节序列
 * 规则：key 字母序排列、无空格、UTF-8
 */

/**
 * 递归按 key 排序，返回规范化的对象副本
 */
function sortKeys(obj) {
  if (obj === null || typeof obj !== 'object') return obj
  if (Array.isArray(obj)) return obj.map(sortKeys)
  const sorted = {}
  Object.keys(obj).sort().forEach(k => {
    sorted[k] = sortKeys(obj[k])
  })
  return sorted
}

/**
 * 将任意 JSON 值规范化为确定性字符串
 */
function canonicalize(obj) {
  return JSON.stringify(sortKeys(obj))
}

module.exports = { canonicalize }
