const FileHandler = require('../../FileHandler');
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('FileHandler', () => {
  let fileHandler;
  let mockBot;
  let mockSessionManager;
  let mockActivityIndicator;
  let mockMainBot;

  beforeEach(() => {
    mockBot = {
      getFile: jest.fn(),
      token: 'test-token'
    };
    
    mockSessionManager = {
      getUserSession: jest.fn(),
      createUserSession: jest.fn(),
      safeSendMessage: jest.fn(),
      sendError: jest.fn()
    };
    
    mockActivityIndicator = {
      start: jest.fn(),
      stop: jest.fn()
    };
    
    mockMainBot = {
      getConcatModeStatus: jest.fn(),
      addToMessageBuffer: jest.fn(),
      safeSendMessage: jest.fn(),
      keyboardHandlers: {
        createReplyKeyboard: jest.fn()
      }
    };

    fileHandler = new FileHandler(mockBot, mockSessionManager, mockActivityIndicator, mockMainBot);
  });

  afterEach(() => {
    // Clean up any temp files created during tests
    fileHandler.cleanup();
  });

  describe('File Type Validation', () => {
    test('should validate document files correctly', () => {
      const validDocument = {
        file_name: 'test.pdf',
        file_size: 1024 * 1024, // 1MB
        mime_type: 'application/pdf'
      };

      const result = fileHandler.validateFile('document', validDocument);
      expect(result.valid).toBe(true);
    });

    test('should reject oversized files', () => {
      const oversizedDocument = {
        file_name: 'large.pdf',
        file_size: 60 * 1024 * 1024, // 60MB (exceeds 50MB limit)
        mime_type: 'application/pdf'
      };

      const result = fileHandler.validateFile('document', oversizedDocument);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('too large');
    });

    test('should reject unsupported file extensions', () => {
      const unsupportedDocument = {
        file_name: 'test.exe',
        file_size: 1024,
        mime_type: 'application/octet-stream'
      };

      const result = fileHandler.validateFile('document', unsupportedDocument);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Unsupported file extension');
    });

    test('should validate video files with proper size limits', () => {
      const validVideo = {
        file_name: 'test.mp4',
        file_size: 50 * 1024 * 1024, // 50MB
        width: 1920,
        height: 1080,
        duration: 120
      };

      const result = fileHandler.validateFile('video', validVideo);
      expect(result.valid).toBe(true);
    });

    test('should validate audio files', () => {
      const validAudio = {
        file_name: 'test.mp3',
        file_size: 10 * 1024 * 1024, // 10MB
        duration: 300,
        title: 'Test Song',
        performer: 'Test Artist'
      };

      const result = fileHandler.validateFile('audio', validAudio);
      expect(result.valid).toBe(true);
    });
  });

  describe('File Message Creation', () => {
    test('should create appropriate document message', () => {
      const fileObject = {
        file_name: 'report.pdf',
        file_size: 2048,
        mime_type: 'application/pdf'
      };
      const filePath = '/tmp/test.pdf';
      const caption = 'Important report';

      const message = fileHandler.createFileMessage('document', fileObject, filePath, caption);
      
      expect(message).toContain('Important report');
      expect(message).toContain('Document file: /tmp/test.pdf');
      expect(message).toContain('Filename: report.pdf');
      expect(message).toContain('Size: 2KB');
      expect(message).toContain('MIME Type: application/pdf');
    });

    test('should create video message with dimensions', () => {
      const fileObject = {
        file_name: 'video.mp4',
        file_size: 1024 * 1024,
        width: 1280,
        height: 720,
        duration: 60
      };
      const filePath = '/tmp/test.mp4';
      const caption = 'Demo video';

      const message = fileHandler.createFileMessage('video', fileObject, filePath, caption);
      
      expect(message).toContain('Demo video');
      expect(message).toContain('Video file: /tmp/test.mp4');
      expect(message).toContain('Dimensions: 1280x720');
      expect(message).toContain('Duration: 60s');
    });

    test('should create audio message with metadata', () => {
      const fileObject = {
        file_name: 'song.mp3',
        file_size: 5 * 1024 * 1024,
        duration: 180,
        title: 'Great Song',
        performer: 'Amazing Artist'
      };
      const filePath = '/tmp/test.mp3';
      const caption = '';

      const message = fileHandler.createFileMessage('audio', fileObject, filePath, caption);
      
      expect(message).toContain('Please analyze this audio');
      expect(message).toContain('Audio file: /tmp/test.mp3');
      expect(message).toContain('Duration: 180s');
      expect(message).toContain('Title: Great Song');
      expect(message).toContain('Performer: Amazing Artist');
    });

    test('should create sticker message', () => {
      const fileObject = {
        file_size: 1024,
        emoji: '😀',
        set_name: 'funny_stickers'
      };
      const filePath = '/tmp/sticker.webp';
      const caption = '😀';

      const message = fileHandler.createFileMessage('sticker', fileObject, filePath, caption);
      
      expect(message).toContain('Sticker file: /tmp/sticker.webp');
      expect(message).toContain('Size: 1KB');
      expect(message).toContain('Emoji: 😀');
      expect(message).toContain('Sticker Set: funny_stickers');
    });
  });

  describe('File Type Extensions', () => {
    test('should get correct default extension for documents', () => {
      const pdfObject = { mime_type: 'application/pdf' };
      const extension = fileHandler.getDefaultExtension('document', pdfObject);
      expect(extension).toBe('.pdf');
    });

    test('should get correct default extension for videos', () => {
      const mp4Object = { mime_type: 'video/mp4' };
      const extension = fileHandler.getDefaultExtension('video', mp4Object);
      expect(extension).toBe('.mp4');
    });

    test('should fall back to type-based extension', () => {
      const unknownObject = { mime_type: 'unknown/type' };
      const extension = fileHandler.getDefaultExtension('audio', unknownObject);
      expect(extension).toBe('.mp3');
    });
  });

  describe('File Emojis', () => {
    test('should return appropriate emojis for file types', () => {
      expect(fileHandler.getFileEmoji('document')).toBe('📄');
      expect(fileHandler.getFileEmoji('video')).toBe('🎥');
      expect(fileHandler.getFileEmoji('audio')).toBe('🎵');
      expect(fileHandler.getFileEmoji('animation')).toBe('🎞️');
      expect(fileHandler.getFileEmoji('sticker')).toBe('🎨');
      expect(fileHandler.getFileEmoji('unknown')).toBe('📎');
    });
  });

  describe('Temp File Management', () => {
    test('should track temp files', () => {
      const filePath = '/tmp/test_file_123.pdf';
      fileHandler.tempFiles.set(filePath, {
        userId: 12345,
        type: 'document',
        createdAt: Date.now()
      });

      const stats = fileHandler.getStats();
      expect(stats.trackedTempFiles).toBe(1);
    });

    test('should clean up old temp files', () => {
      const oldTime = Date.now() - (25 * 60 * 60 * 1000); // 25 hours ago
      const recentTime = Date.now() - (1 * 60 * 60 * 1000); // 1 hour ago
      
      fileHandler.tempFiles.set('/tmp/old_file.pdf', {
        userId: 12345,
        type: 'document',
        createdAt: oldTime
      });
      
      fileHandler.tempFiles.set('/tmp/recent_file.pdf', {
        userId: 12345,
        type: 'document',
        createdAt: recentTime
      });

      fileHandler.cleanupOldTempFiles(24); // 24 hours max age
      
      // Old file should be removed from tracking
      expect(fileHandler.tempFiles.has('/tmp/old_file.pdf')).toBe(false);
      // Recent file should still be tracked
      expect(fileHandler.tempFiles.has('/tmp/recent_file.pdf')).toBe(true);
    });
  });

  describe('Session Integration', () => {
    test('should handle concat mode correctly for documents', async () => {
      mockMainBot.getConcatModeStatus.mockReturnValue(true);
      mockMainBot.addToMessageBuffer.mockResolvedValue(2);

      const msg = {
        from: { id: 12345 },
        chat: { id: 67890 },
        document: {
          file_id: 'doc123',
          file_name: 'test.pdf',
          file_size: 1024,
          mime_type: 'application/pdf'
        },
        caption: 'Test document'
      };

      mockBot.getFile.mockResolvedValue({
        file_path: 'documents/test.pdf'
      });

      // Mock file download
      jest.spyOn(fileHandler, 'downloadFromUrl').mockResolvedValue();

      const processCallback = jest.fn();
      await fileHandler.handleDocumentMessage(msg, processCallback);

      expect(mockMainBot.addToMessageBuffer).toHaveBeenCalledWith(12345, {
        type: 'document',
        content: 'Test document',
        filePath: expect.stringContaining('telegram_document_12345_'),
        fileInfo: {
          name: 'test.pdf',
          size: 1024,
          mimeType: 'application/pdf'
        }
      });

      expect(mockMainBot.safeSendMessage).toHaveBeenCalledWith(
        67890,
        expect.stringContaining('📄 **Document Added to Buffer**')
      );

      // Should not call processCallback in concat mode
      expect(processCallback).not.toHaveBeenCalled();
    });

    test('should process file normally when not in concat mode', async () => {
      mockMainBot.getConcatModeStatus.mockReturnValue(false);
      mockSessionManager.getUserSession.mockReturnValue({
        sessionId: 'test-session',
        messageCount: 1
      });

      const msg = {
        from: { id: 12345 },
        chat: { id: 67890 },
        video: {
          file_id: 'video123',
          file_name: 'test.mp4',
          file_size: 1024 * 1024,
          width: 1280,
          height: 720,
          duration: 60
        },
        caption: 'Test video'
      };

      mockBot.getFile.mockResolvedValue({
        file_path: 'videos/test.mp4'
      });

      // Mock file download
      jest.spyOn(fileHandler, 'downloadFromUrl').mockResolvedValue();

      const processCallback = jest.fn();
      await fileHandler.handleVideoMessage(msg, processCallback);

      // Should call processCallback with the generated message
      expect(processCallback).toHaveBeenCalledWith(
        expect.stringContaining('Test video'),
        12345,
        67890
      );
    });
  });

  describe('Error Handling', () => {
    test('should handle file download errors gracefully', async () => {
      const msg = {
        from: { id: 12345 },
        chat: { id: 67890 },
        document: {
          file_id: 'doc123',
          file_name: 'test.pdf',
          file_size: 1024
        }
      };

      mockBot.getFile.mockRejectedValue(new Error('Network error'));

      const processCallback = jest.fn();
      await fileHandler.handleDocumentMessage(msg, processCallback);

      expect(mockSessionManager.sendError).toHaveBeenCalledWith(
        67890,
        expect.any(Error)
      );
    });

    test('should handle validation errors', async () => {
      const msg = {
        from: { id: 12345 },
        chat: { id: 67890 },
        document: {
          file_id: 'doc123',
          file_name: 'huge.pdf',
          file_size: 100 * 1024 * 1024 // 100MB - exceeds limit
        }
      };

      const processCallback = jest.fn();
      await fileHandler.handleDocumentMessage(msg, processCallback);

      expect(mockMainBot.safeSendMessage).toHaveBeenCalledWith(
        67890,
        expect.stringContaining('❌ **File Not Supported**')
      );
    });
  });

  describe('Supported File Types', () => {
    test('should have correct file type configurations', () => {
      const stats = fileHandler.getStats();
      expect(stats.supportedTypes).toEqual([
        'document',
        'video',
        'audio',
        'animation',
        'sticker'
      ]);

      expect(fileHandler.supportedTypes.document.maxSize).toBe(50 * 1024 * 1024);
      expect(fileHandler.supportedTypes.video.maxSize).toBe(100 * 1024 * 1024);
      expect(fileHandler.supportedTypes.audio.maxSize).toBe(50 * 1024 * 1024);
    });

    test('should include common file extensions', () => {
      expect(fileHandler.supportedTypes.document.extensions).toContain('.pdf');
      expect(fileHandler.supportedTypes.document.extensions).toContain('.docx');
      expect(fileHandler.supportedTypes.video.extensions).toContain('.mp4');
      expect(fileHandler.supportedTypes.audio.extensions).toContain('.mp3');
    });
  });
});