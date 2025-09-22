const crypto = require('crypto');

class EncryptionService {
  constructor() {
    this.algorithm = 'aes-256-gcm';
    this.keyLength = 32;
    this.ivLength = 16;
    this.tagLength = 16;
    
    if (!process.env.ENCRYPTION_KEY) {
      throw new Error('ENCRYPTION_KEY environment variable is required');
    }
    
    // Ensure key is exactly 32 bytes
    this.key = crypto.scryptSync(process.env.ENCRYPTION_KEY, 'salt', this.keyLength);
  }

  /**
   * Encrypt sensitive data (client_secret, refresh_token, etc.)
   * @param {string} plaintext - The data to encrypt
   * @returns {string} - Base64 encoded encrypted data with IV and tag
   */
  encrypt(plaintext) {
    if (!plaintext) return null;
    
    try {
      const iv = crypto.randomBytes(this.ivLength);
      const cipher = crypto.createCipher(this.algorithm, this.key);
      cipher.setAAD(Buffer.from('sfmc-toolkit'));
      
      let encrypted = cipher.update(plaintext, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const tag = cipher.getAuthTag();
      
      // Combine IV + encrypted data + tag, then base64 encode
      const combined = Buffer.concat([iv, Buffer.from(encrypted, 'hex'), tag]);
      return combined.toString('base64');
      
    } catch (error) {
      console.error('Encryption failed:', error);
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypt sensitive data
   * @param {string} encryptedData - Base64 encoded encrypted data
   * @returns {string} - Decrypted plaintext
   */
  decrypt(encryptedData) {
    if (!encryptedData) return null;
    
    try {
      const combined = Buffer.from(encryptedData, 'base64');
      
      // Extract IV, encrypted data, and tag
      const iv = combined.slice(0, this.ivLength);
      const tag = combined.slice(-this.tagLength);
      const encrypted = combined.slice(this.ivLength, -this.tagLength);
      
      const decipher = crypto.createDecipher(this.algorithm, this.key);
      decipher.setAAD(Buffer.from('sfmc-toolkit'));
      decipher.setAuthTag(tag);
      
      let decrypted = decipher.update(encrypted, null, 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
      
    } catch (error) {
      console.error('Decryption failed:', error);
      throw new Error('Failed to decrypt data');
    }
  }

  /**
   * Generate a secure random string for session IDs, etc.
   * @param {number} length - Length of the random string
   * @returns {string} - Random hex string
   */
  generateSecureRandom(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Hash passwords or other data that doesn't need to be decrypted
   * @param {string} data - Data to hash
   * @param {string} salt - Optional salt (generates random if not provided)
   * @returns {object} - {hash, salt}
   */
  hash(data, salt = null) {
    if (!salt) {
      salt = crypto.randomBytes(16).toString('hex');
    }
    
    const hash = crypto.scryptSync(data, salt, 64).toString('hex');
    return { hash, salt };
  }

  /**
   * Verify a hash
   * @param {string} data - Original data
   * @param {string} hash - Hash to verify against
   * @param {string} salt - Salt used in original hash
   * @returns {boolean} - True if hash matches
   */
  verifyHash(data, hash, salt) {
    const { hash: newHash } = this.hash(data, salt);
    return newHash === hash;
  }
}

module.exports = new EncryptionService();
