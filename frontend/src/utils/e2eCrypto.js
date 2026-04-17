import sodium from 'libsodium-wrappers';

let _sodium = null;

async function getSodium() {
    if (!_sodium) {
        await sodium.ready;
        _sodium = sodium;
    }
    return _sodium;
}

export async function generateKeyPair() {
    const s = await getSodium();
    const kp = s.crypto_box_keypair();
    return {
        publicKey: s.to_base64(kp.publicKey),
        privateKey: s.to_base64(kp.privateKey),
    };
}

async function deriveAesKey(passphrase, salt) {
    const km = await crypto.subtle.importKey(
        'raw', new TextEncoder().encode(passphrase), { name: 'PBKDF2' }, false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations: 210000, hash: 'SHA-256' },
        km,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

const toB64 = arr => btoa(String.fromCharCode(...arr));
const fromB64 = b => Uint8Array.from(atob(b), c => c.charCodeAt(0));

export async function storePrivateKey(userId, privateKeyB64, passphrase) {
    if (!passphrase) {
        sessionStorage.setItem(`e2e_sk_${userId}`, privateKeyB64);
        return;
    }
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveAesKey(passphrase, salt);
    const ct = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv }, key, new TextEncoder().encode(privateKeyB64)
    );
    localStorage.setItem(`e2e_key_${userId}`, JSON.stringify({
        s: toB64(salt), i: toB64(iv), c: toB64(new Uint8Array(ct)),
    }));
    sessionStorage.setItem(`e2e_sk_${userId}`, privateKeyB64);
}

export async function loadPrivateKey(userId, passphrase) {
    const cached = sessionStorage.getItem(`e2e_sk_${userId}`);
    if (cached) return cached;
    const stored = localStorage.getItem(`e2e_key_${userId}`);
    if (!stored) return null;
    const { s, i, c } = JSON.parse(stored);
    const key = await deriveAesKey(passphrase, fromB64(s));
    const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: fromB64(i) }, key, fromB64(c)
    );
    const pk = new TextDecoder().decode(plain);
    sessionStorage.setItem(`e2e_sk_${userId}`, pk);
    return pk;
}

export function hasStoredKey(userId) {
    return !!(sessionStorage.getItem(`e2e_sk_${userId}`) || localStorage.getItem(`e2e_key_${userId}`));
}

export function getCachedPrivateKey(userId) {
    return sessionStorage.getItem(`e2e_sk_${userId}`);
}

// Initialize E2E keys for password-based login. Encrypts private key with the login password.
export async function initE2EKeys(userId, token, passphrase, apiUrl) {
    if (hasStoredKey(userId)) {
        try {
            const pk = await loadPrivateKey(userId, passphrase);
            if (pk) return;
        } catch { /* wrong passphrase — fall through to regenerate */ }
    }
    const { publicKey, privateKey } = await generateKeyPair();
    await storePrivateKey(userId, privateKey, passphrase);
    await fetch(`${apiUrl}/user/keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ publicKey }),
    });
}

// Initialize E2E keys for OTP-based login. Key lives only for the session.
export async function initE2ESessionKey(userId, token, apiUrl) {
    if (getCachedPrivateKey(userId)) return;
    const { publicKey, privateKey } = await generateKeyPair();
    sessionStorage.setItem(`e2e_sk_${userId}`, privateKey);
    await fetch(`${apiUrl}/user/keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ publicKey }),
    });
}

// Encrypt a text message. Returns 'e2e:<base64(nonce+ciphertext)>'.
export async function encryptMessage(plaintext, recipientPublicKeyB64, myPrivateKeyB64) {
    const s = await getSodium();
    const nonce = s.randombytes_buf(s.crypto_box_NONCEBYTES);
    const ct = s.crypto_box_easy(
        new TextEncoder().encode(plaintext), nonce,
        s.from_base64(recipientPublicKeyB64), s.from_base64(myPrivateKeyB64)
    );
    const combined = new Uint8Array(nonce.length + ct.length);
    combined.set(nonce);
    combined.set(ct, nonce.length);
    return 'e2e:' + s.to_base64(combined);
}

// Decrypt a text message. Returns plaintext, or original string if not encrypted.
export async function decryptMessage(encrypted, senderPublicKeyB64, myPrivateKeyB64) {
    if (!encrypted?.startsWith('e2e:')) return encrypted;
    const s = await getSodium();
    try {
        const combined = s.from_base64(encrypted.slice(4));
        const nonce = combined.slice(0, s.crypto_box_NONCEBYTES);
        const ct = combined.slice(s.crypto_box_NONCEBYTES);
        const plain = s.crypto_box_open_easy(
            ct, nonce, s.from_base64(senderPublicKeyB64), s.from_base64(myPrivateKeyB64)
        );
        return new TextDecoder().decode(plain);
    } catch {
        return '[🔒 Unable to decrypt]';
    }
}

// Encrypt raw file bytes. Returns Uint8Array (nonce + ciphertext).
export async function encryptFileBytes(bytes, recipientPublicKeyB64, myPrivateKeyB64) {
    const s = await getSodium();
    const nonce = s.randombytes_buf(s.crypto_box_NONCEBYTES);
    const ct = s.crypto_box_easy(
        bytes, nonce,
        s.from_base64(recipientPublicKeyB64), s.from_base64(myPrivateKeyB64)
    );
    const combined = new Uint8Array(nonce.length + ct.length);
    combined.set(nonce);
    combined.set(ct, nonce.length);
    return combined;
}

// Decrypt raw file bytes. Returns Uint8Array (plaintext).
export async function decryptFileBytes(encryptedBytes, senderPublicKeyB64, myPrivateKeyB64) {
    const s = await getSodium();
    const nonce = encryptedBytes.slice(0, s.crypto_box_NONCEBYTES);
    const ct = encryptedBytes.slice(s.crypto_box_NONCEBYTES);
    return s.crypto_box_open_easy(
        ct, nonce, s.from_base64(senderPublicKeyB64), s.from_base64(myPrivateKeyB64)
    );
}
