const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');

/**
 * File Handler - Universal file processing and management for Telegram
 * Handles document, video, audio, and sticker files with Claude integration
 * Extends existing ImageHandler and VoiceMessageHandler functionality
 */
class FileHandler {
  constructor(bot, sessionManager, activityIndicator, mainBot) {
    this.bot = bot;
    this.sessionManager = sessionManager;
    this.activityIndicator = activityIndicator;
    this.mainBot = mainBot; // Reference to main bot for concat mode access

    // Supported file types with size limits (in bytes)
    this.supportedTypes = {
      document: {
        maxSize: 50 * 1024 * 1024, // 50MB
        extensions: ['.pdf', '.doc', '.docx', '.txt', '.md', '.json', '.xml', '.csv', '.xlsx', '.xls', '.ppt', '.pptx'],
        description: 'Documents'
      },
      video: {
        maxSize: 100 * 1024 * 1024, // 100MB
        extensions: ['.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv'],
        description: 'Videos'
      },
      audio: {
        maxSize: 50 * 1024 * 1024, // 50MB
        extensions: ['.mp3', '.wav', '.aac', '.flac', '.m4a', '.ogg'],
        description: 'Audio files'
      },
      animation: {
        maxSize: 20 * 1024 * 1024, // 20MB
        extensions: ['.gif', '.mp4'],
        description: 'Animations/GIFs'
      },
      sticker: {
        maxSize: 5 * 1024 * 1024, // 5MB
        extensions: ['.webp', '.tgs'],
        description: 'Stickers'
      }
    };

    this.tempFiles = new Map(); // Track temp files for cleanup
  }

  /**
   * Handle document message with optional caption
   */
  async handleDocumentMessage(msg, processUserMessageCallback) {
    const userId = msg.from.id;
    const chatId = msg.chat.id;
    const document = msg.document;
    const caption = msg.caption || '';

    console.log(`[User ${userId}] Document message: "${document.file_name}" (${document.file_size} bytes) with caption: "${caption}"`);

    return await this.processFileMessage(msg, 'document', document, caption, processUserMessageCallback);
  }

  /**
   * Handle video message with optional caption
   */
  async handleVideoMessage(msg, processUserMessageCallback) {
    const userId = msg.from.id;
    const chatId = msg.chat.id;
    const video = msg.video;
    const caption = msg.caption || '';

    console.log(`[User ${userId}] Video message: ${video.width}x${video.height} (${video.file_size} bytes) with caption: "${caption}"`);

    return await this.processFileMessage(msg, 'video', video, caption, processUserMessageCallback);
  }

  /**
   * Handle audio message with optional caption
   */
  async handleAudioMessage(msg, processUserMessageCallback) {
    const userId = msg.from.id;
    const chatId = msg.chat.id;
    const audio = msg.audio;
    const caption = msg.caption || '';

    console.log(`[User ${userId}] Audio message: "${audio.title || 'Unknown'}" (${audio.file_size} bytes) with caption: "${caption}"`);

    return await this.processFileMessage(msg, 'audio', audio, caption, processUserMessageCallback);
  }

  /**
   * Handle animation/GIF message with optional caption
   */
  async handleAnimationMessage(msg, processUserMessageCallback) {
    const userId = msg.from.id;
    const chatId = msg.chat.id;
    const animation = msg.animation;
    const caption = msg.caption || '';

    console.log(`[User ${userId}] Animation message: ${animation.width}x${animation.height} (${animation.file_size} bytes) with caption: "${caption}"`);

    return await this.processFileMessage(msg, 'animation', animation, caption, processUserMessageCallback);
  }

  /**
   * Handle sticker message
   */
  async handleStickerMessage(msg, processUserMessageCallback) {
    const userId = msg.from.id;
    const chatId = msg.chat.id;
    const sticker = msg.sticker;

    console.log(`[User ${userId}] Sticker message: ${sticker.emoji || 'No emoji'} (${sticker.file_size} bytes)`);

    return await this.processFileMessage(msg, 'sticker', sticker, sticker.emoji || '', processUserMessageCallback);
  }

  /**
   * Universal file processing method
   */
  async processFileMessage(msg, fileType, fileObject, caption, processUserMessageCallback) {
    const userId = msg.from.id;
    const chatId = msg.chat.id;

    let filePath = null;
    try {
      // Validate file type and size
      const validation = this.validateFile(fileType, fileObject);
      if (!validation.valid) {
        await this.mainBot.safeSendMessage(chatId, `❌ **File Not Supported**\n\n${validation.error}`);
        return;
      }

      console.log(`[User ${userId}] Processing ${fileType}: ${fileObject.file_id}`);

      // Download the file to temp directory
      filePath = await this.downloadFile(fileObject.file_id, fileType, userId, fileObject);
      console.log(`[User ${userId}] Downloaded ${fileType} to temp: ${filePath}`);

      // Create message for Claude with file path and caption
      let message = this.createFileMessage(fileType, fileObject, filePath, caption);

      console.log(`[User ${userId}] Sending to Claude: "${message}"`);

      // Check if concat mode is enabled
      if (this.mainBot && this.mainBot.getConcatModeStatus(userId)) {
        // Add file to buffer
        const bufferSize = await this.mainBot.addToMessageBuffer(userId, {
          type: fileType,
          content: caption,
          filePath: filePath,
          fileInfo: {
            name: fileObject.file_name || `${fileType}_file`,
            size: fileObject.file_size,
            mimeType: fileObject.mime_type
          }
        });
        
        const fileEmoji = this.getFileEmoji(fileType);
        await this.mainBot.safeSendMessage(chatId, 
          `${fileEmoji} **${this.supportedTypes[fileType].description.slice(0, -1)} Added to Buffer**\n\n` +
          `📁 **File:** ${fileObject.file_name || 'Unknown'}\n` +
          `${caption ? `📝 **Caption:** ${caption}\n` : ''}` +
          `\n📊 **Buffer:** ${bufferSize} message${bufferSize > 1 ? 's' : ''}`, {
            reply_markup: this.mainBot.keyboardHandlers.createReplyKeyboard(userId)
          }
        );
        return;
      }

      // Process message with temp file cleanup tracking
      await this.processWithCleanupTracking(message, userId, chatId, filePath, processUserMessageCallback);

    } catch (error) {
      console.error(`[User ${userId}] Error processing ${fileType}:`, error);
      
      // Clean up temp file on error
      if (filePath && fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
          this.tempFiles.delete(filePath);
          console.log(`[User ${userId}] Cleaned up temp ${fileType} on error: ${filePath}`);
        } catch (cleanupError) {
          console.error(`[User ${userId}] Failed to cleanup temp ${fileType}:`, cleanupError);
        }
      }
      
      await this.sessionManager.sendError(chatId, error);
    }
  }

  /**
   * Validate file type and size
   */
  validateFile(fileType, fileObject) {
    const typeConfig = this.supportedTypes[fileType];
    if (!typeConfig) {
      return { valid: false, error: `Unsupported file type: ${fileType}` };
    }

    // Check file size
    if (fileObject.file_size > typeConfig.maxSize) {
      const maxSizeMB = Math.round(typeConfig.maxSize / (1024 * 1024));
      const fileSizeMB = Math.round(fileObject.file_size / (1024 * 1024));
      return { 
        valid: false, 
        error: `File too large: ${fileSizeMB}MB (max ${maxSizeMB}MB for ${typeConfig.description.toLowerCase()})` 
      };
    }

    // Check file extension if available
    if (fileObject.file_name) {
      const extension = path.extname(fileObject.file_name).toLowerCase();
      if (extension && !typeConfig.extensions.includes(extension)) {
        return { 
          valid: false, 
          error: `Unsupported file extension: ${extension}\n\nSupported: ${typeConfig.extensions.join(', ')}` 
        };
      }
    }

    return { valid: true };
  }

  /**
   * Create appropriate message for Claude based on file type
   */
  createFileMessage(fileType, fileObject, filePath, caption) {
    const fileName = fileObject.file_name || `${fileType}_file`;
    const fileSize = Math.round(fileObject.file_size / 1024); // KB

    let message = '';
    
    if (caption.trim()) {
      message = `${caption.trim()}\n\n`;
    }

    switch (fileType) {
      case 'document':
        message += `Document file: ${filePath}\nFilename: ${fileName}\nSize: ${fileSize}KB`;
        if (fileObject.mime_type) {
          message += `\nMIME Type: ${fileObject.mime_type}`;
        }
        break;

      case 'video':
        message += `Video file: ${filePath}\nFilename: ${fileName}\nSize: ${fileSize}KB`;
        if (fileObject.width && fileObject.height) {
          message += `\nDimensions: ${fileObject.width}x${fileObject.height}`;
        }
        if (fileObject.duration) {
          message += `\nDuration: ${fileObject.duration}s`;
        }
        break;

      case 'audio':
        message += `Audio file: ${filePath}\nFilename: ${fileName}\nSize: ${fileSize}KB`;
        if (fileObject.duration) {
          message += `\nDuration: ${fileObject.duration}s`;
        }
        if (fileObject.title) {
          message += `\nTitle: ${fileObject.title}`;
        }
        if (fileObject.performer) {
          message += `\nPerformer: ${fileObject.performer}`;
        }
        break;

      case 'animation':
        message += `Animation/GIF file: ${filePath}\nFilename: ${fileName}\nSize: ${fileSize}KB`;
        if (fileObject.width && fileObject.height) {
          message += `\nDimensions: ${fileObject.width}x${fileObject.height}`;
        }
        break;

      case 'sticker':
        message += `Sticker file: ${filePath}\nSize: ${fileSize}KB`;
        if (fileObject.emoji) {
          message += `\nEmoji: ${fileObject.emoji}`;
        }
        if (fileObject.set_name) {
          message += `\nSticker Set: ${fileObject.set_name}`;
        }
        break;

      default:
        message += `File: ${filePath}\nFilename: ${fileName}\nSize: ${fileSize}KB`;
    }

    if (!caption.trim()) {
      message = `Please analyze this ${fileType}: ${message}`;
    }

    return message;
  }

  /**
   * Get appropriate emoji for file type
   */
  getFileEmoji(fileType) {
    const emojis = {
      document: '📄',
      video: '🎥',
      audio: '🎵',
      animation: '🎞️',
      sticker: '🎨'
    };
    return emojis[fileType] || '📎';
  }

  /**
   * Download file from Telegram servers to temp directory
   */
  async downloadFile(fileId, fileType, userId, fileObject) {
    try {
      // Get file info from Telegram
      const file = await this.bot.getFile(fileId);
      const fileUrl = `https://api.telegram.org/file/bot${this.bot.token}/${file.file_path}`;
      
      // Use system temp directory
      const tempDir = os.tmpdir();
      
      // Generate unique filename in temp directory
      const timestamp = Date.now();
      const originalExtension = path.extname(file.file_path) || 
                               (fileObject.file_name ? path.extname(fileObject.file_name) : '') ||
                               this.getDefaultExtension(fileType, fileObject);
      const filename = `telegram_${fileType}_${userId}_${timestamp}${originalExtension}`;
      const filePath = path.join(tempDir, filename);

      console.log(`Downloading ${fileType} from: ${fileUrl}`);
      console.log(`Saving to temp file: ${filePath}`);

      // Download the file
      await this.downloadFromUrl(fileUrl, filePath);

      // Track temp file for cleanup
      this.tempFiles.set(filePath, {
        userId,
        type: fileType,
        createdAt: Date.now()
      });

      return filePath;
    } catch (error) {
      console.error(`Error downloading ${fileType}:`, error);
      throw new Error(`Failed to download ${fileType}: ${error.message}`);
    }
  }

  /**
   * Get default file extension based on type and MIME type
   */
  getDefaultExtension(fileType, fileObject) {
    if (fileObject.mime_type) {
      const mimeExtensions = {
        'application/pdf': '.pdf',
        'text/plain': '.txt',
        'application/json': '.json',
        'video/mp4': '.mp4',
        'audio/mpeg': '.mp3',
        'audio/ogg': '.ogg',
        'image/gif': '.gif',
        'image/webp': '.webp'
      };
      if (mimeExtensions[fileObject.mime_type]) {
        return mimeExtensions[fileObject.mime_type];
      }
    }

    // Fallback extensions
    const fallbacks = {
      document: '.txt',
      video: '.mp4',
      audio: '.mp3',
      animation: '.gif',
      sticker: '.webp'
    };
    return fallbacks[fileType] || '';
  }

  /**
   * Download file from URL to local path
   */
  downloadFromUrl(url, filePath) {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(filePath);
      
      https.get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
          return;
        }

        response.pipe(file);

        file.on('finish', () => {
          file.close();
          resolve();
        });

        file.on('error', (error) => {
          fs.unlink(filePath, () => {}); // Delete partial file
          reject(error);
        });
      }).on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Process file message with temp file cleanup tracking
   */
  async processWithCleanupTracking(text, userId, chatId, tempFilePath, processUserMessageCallback) {
    // Get or create user session first
    let session = this.sessionManager.getUserSession(userId);
    
    if (!session) {
      // First message - create new session
      console.log(`[FileHandler] Creating new session for user ${userId}`);
      session = await this.sessionManager.createUserSession(userId, chatId);
      
      // Send session init message
      const sessionInitText = '🚀 **New Session Started**\n\n' +
        'Ready to process your requests with Claude CLI stream-json mode.\n\n' +
        '🔄 Session continuity with ID tracking\n' +
        '🛡️ Auto-permissions enabled\n' +
        '📋 Live TodoWrite updates active\n' +
        '📎 Universal file analysis ready\n' +
        '📄 Documents • 🎥 Videos • 🎵 Audio • 🎞️ Animations • 🎨 Stickers\n\n' +
        '💡 Use /end to close this session\n' +
        '📚 Use /sessions to view history';
      
      await this.sessionManager.safeSendMessage(chatId, sessionInitText);
    }
    
    // Store temp file path in session for cleanup after Claude completes
    if (!session.tempFilePaths) {
      session.tempFilePaths = [];
    }
    session.tempFilePaths.push(tempFilePath);
    console.log(`[User ${userId}] Stored temp file path in session: ${tempFilePath}`);
    
    try {
      // Use the callback to process the message
      await processUserMessageCallback(text, userId, chatId);
      
      // Note: Temp files will be cleaned up in SessionManager when Claude completes
      
    } catch (error) {
      // Clean up temp file immediately on error during setup
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        try {
          fs.unlinkSync(tempFilePath);
          this.tempFiles.delete(tempFilePath);
          console.log(`[User ${userId}] Cleaned up temp file on setup error: ${tempFilePath}`);
        } catch (cleanupError) {
          console.error(`[User ${userId}] Failed to cleanup temp file:`, cleanupError);
        }
      }
      
      // Remove temp file path from session
      if (session && session.tempFilePaths) {
        const index = session.tempFilePaths.indexOf(tempFilePath);
        if (index > -1) {
          session.tempFilePaths.splice(index, 1);
        }
      }
      
      // Re-throw the error to maintain error handling flow
      throw error;
    }
  }

  /**
   * Clean up temporary files (called by SessionManager)
   */
  static cleanupTempFiles(session, userId) {
    if (session && session.tempFilePaths) {
      for (const filePath of session.tempFilePaths) {
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`[User ${userId}] Cleaned up temp file after Claude completion: ${filePath}`);
          }
        } catch (error) {
          console.error(`[User ${userId}] Failed to cleanup temp file:`, error);
        }
      }
      
      // Clear temp file paths from session
      session.tempFilePaths = [];
    }
  }

  /**
   * Clean up old temporary files (maintenance task)
   */
  cleanupOldTempFiles(maxAgeHours = 24) {
    const maxAge = maxAgeHours * 60 * 60 * 1000; // Convert to milliseconds
    const now = Date.now();
    
    let cleanedCount = 0;
    
    for (const [filePath, info] of this.tempFiles.entries()) {
      if (now - info.createdAt > maxAge) {
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            cleanedCount++;
          }
        } catch (error) {
          console.error(`Failed to cleanup old temp file ${filePath}:`, error);
        }
        
        this.tempFiles.delete(filePath);
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`🧹 Cleaned up ${cleanedCount} old temporary files`);
    }
  }

  /**
   * Get handler statistics
   */
  getStats() {
    return {
      handlerType: 'FileHandler',
      tempDirectory: os.tmpdir(),
      trackedTempFiles: this.tempFiles.size,
      supportedTypes: Object.keys(this.supportedTypes)
    };
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    // Clean up all tracked temp files
    let cleanedCount = 0;
    
    for (const [filePath] of this.tempFiles.entries()) {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          cleanedCount++;
        }
      } catch (error) {
        console.error(`Failed to cleanup temp file on shutdown:`, error);
      }
    }
    
    this.tempFiles.clear();
    
    if (cleanedCount > 0) {
      console.log(`🧹 FileHandler cleanup: removed ${cleanedCount} temp files`);
    }
  }
}

module.exports = FileHandler;