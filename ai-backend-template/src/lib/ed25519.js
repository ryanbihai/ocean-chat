/**
 * @file ed25519.js
 * @description Ed25519 密钥生成、签名、验签——用于 L1 服务所有权鉴权
 * 密钥格式: "ed25519:<base64url_raw_bytes>"
 */

const crypto = require('crypto')

// Ed25519 DER 前缀——用于从 raw bytes 构造 KeyObject
const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')
const PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex')

function rawToPublicKeyObject(rawBytes) {
  const der = Buffer.concat([SPKI_PREFIX, rawBytes])
  return crypto.createPublicKey({ key: der, format: 'der', type: 'spki' })
}

function rawToPrivateKeyObject(rawBytes) {
  const der = Buffer.concat([PKCS8_PREFIX, rawBytes])
  return crypto.createPrivateKey({ key: der, format: 'der', type: 'pkcs8' })
}

function stripPrefix(s) {
  return s.replace(/^ed25519:/, '')
}

/** 生成 Ed25519 密钥对 */
function generateKeypair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
  const jwkPub = publicKey.export({ format: 'jwk' })
  const jwkPriv = privateKey.export({ format: 'jwk' })
  return {
    publicKey: 'ed25519:' + jwkPub.x,
    secretKey: 'ed25519:' + jwkPriv.d
  }
}

/** 用私钥对消息签名，返回 "ed25519:<base64url_signature>" */
function sign(secretKeyStr, message) {
  try {
    const raw = Buffer.from(stripPrefix(secretKeyStr), 'base64url')
    if (raw.length !== 32) throw new Error(`Invalid secret key length: expected 32, got ${raw.length}`)
    const privateKey = rawToPrivateKeyObject(raw)
    const sig = crypto.sign(null, Buffer.from(message, 'utf8'), privateKey)
    return 'ed25519:' + sig.toString('base64url')
  } catch (e) {
    throw new Error(`Ed25519 sign failed: ${e.message}`)
  }
}

/** 验签，返回 boolean */
function verify(publicKeyStr, message, signatureStr) {
  try {
    const pubRaw = Buffer.from(stripPrefix(publicKeyStr), 'base64url')
    const sigRaw = Buffer.from(stripPrefix(signatureStr), 'base64url')
    const publicKey = rawToPublicKeyObject(pubRaw)
    return crypto.verify(null, Buffer.from(message, 'utf8'), publicKey, sigRaw)
  } catch (_) {
    return false
  }
}

module.exports = { generateKeypair, sign, verify }
