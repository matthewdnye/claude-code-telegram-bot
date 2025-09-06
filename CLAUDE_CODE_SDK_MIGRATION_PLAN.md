# Claude Code SDK Migration Plan
## От процессного подхода к SDK с Telegram Custom Tools

## 🎯 Цели миграции

**Основная задача**: Безопасно перевести bot1 на Claude Code SDK версии 1.0.94+ с Custom Tools as Callbacks для интеграции Telegram файл-сендера, не нарушив работу остальных ботов.

### ✅ Преимущества SDK подхода:
1. **🔧 Прямая интеграция**: Telegram tools прямо в коде бота
2. **⚡ Производительность**: Нет IPC между процессами  
3. **🛡️ Type Safety**: Автоматическая типизация с Zod
4. **🎛️ Полный контроль**: canUseTool callback для точных разрешений
5. **🧹 Простота**: Никаких JSON конфигов или cleanup процессов

## 📊 Анализ текущей архитектуры

### 🔍 Ключевые компоненты для миграции:

#### **1. Claude Process Spawning** (3 места):
- **`claude-stream-processor.js`** 🔥 **КРИТИЧНО** - основное место запуска Claude CLI
- **`SessionManager.js`** ⚠️ **ВАЖНО** - compact и validation операции  
- **`ClaudeCodeTokenCounter.js`** 📊 **ВТОРОСТЕПЕННО** - контекстный анализ

#### **2. SessionManager Architecture** (центральный компонент):
```javascript
// Текущий поток
SessionManager → ClaudeStreamProcessor → spawn('claude') → STDIO/Stream processing

// Целевой поток  
SessionManager → ClaudeSDKProcessor → SDK query() → Callback-based tools
```

#### **3. Точки интеграции в bot.js**:
- `this.sessionManager` - используется в 25+ местах
- Все handlers (ImageHandler, FileHandler, VoiceHandler) зависят от SessionManager
- KeyboardHandlers использует SessionManager методы

## 🏗️ Архитектурное решение

### **Strategy Pattern для Processor Abstraction**

```typescript
interface ProcessorInterface {
  startNewConversation(prompt: string): Promise<void>
  continueConversation(prompt: string, sessionId?: string): Promise<void>
  resumeSession(sessionId: string, prompt: string): Promise<void>
}

// Текущая реализация
class ClaudeStreamProcessor implements ProcessorInterface {
  // spawn('claude') + STDIO
}

// Новая реализация
class ClaudeSDKProcessor implements ProcessorInterface {
  // Claude Code SDK + Custom Tools
}
```

## 📋 ДЕТАЛЬНЫЙ ПЛАН МИГРАЦИИ

### **PHASE 1: Foundation & Feature Flag** ⏱️ *2-3 часа*

#### **1.1 Добавить Feature Flag в ConfigManager**
```json
// configs/bot1.json
{
  "useClaudeSDK": true,     // 🔥 ТОЛЬКО для bot1
  "adminUserId": "...",
  "botToken": "..."
}
```

#### **1.2 Создать SDK Dependencies**
```bash
npm install @anthropic-ai/claude-code zod
```

#### **1.3 Создать ProcessorInterface**
```typescript
// ProcessorInterface.js - абстракция для обоих подходов
class ProcessorInterface {
  async startNewConversation(prompt) { throw new Error('Not implemented'); }
  async continueConversation(prompt, sessionId) { throw new Error('Not implemented'); }
  async resumeSession(sessionId, prompt) { throw new Error('Not implemented'); }
  // + event handling, cancellation, etc.
}
```

---

### **PHASE 2: ClaudeSDKProcessor Implementation** ⏱️ *4-5 часов*

#### **2.1 Создать ClaudeSDKProcessor**
```typescript
// ClaudeSDKProcessor.js
const { query, tool, createSdkMcpServer } = require('@anthropic-ai/claude-code');
const { z } = require('zod');

class ClaudeSDKProcessor extends ProcessorInterface {
  constructor(options = {}) {
    super();
    this.options = options;
    this.telegramTools = null;
    this.currentQuery = null;
    this.sessionId = null;
  }

  // Создание Telegram Custom Tools
  createTelegramTools(botToken, chatId) {
    const TelegramBot = require('node-telegram-bot-api');
    const bot = new TelegramBot(botToken, { polling: false });

    return createSdkMcpServer({
      name: "telegram-sender",
      version: "1.0.0",
      tools: [
        tool(
          "send_telegram_image",
          "Send image file to Telegram chat",
          {
            file_path: z.string().describe("Path to image file"),
            caption: z.string().optional().describe("Optional image caption")
          },
          async (args) => {
            const result = await bot.sendPhoto(chatId, args.file_path, {
              caption: args.caption || 'Image from Claude Code'
            });
            return {
              content: [{
                type: "text",
                text: `✅ Image sent successfully! Message ID: ${result.message_id}`
              }]
            };
          }
        ),
        tool(
          "send_telegram_document",
          "Send document file to Telegram chat", 
          {
            file_path: z.string().describe("Path to document file"),
            caption: z.string().optional().describe("Optional document caption")
          },
          async (args) => {
            const result = await bot.sendDocument(chatId, args.file_path, {
              caption: args.caption || 'Document from Claude Code'
            });
            return {
              content: [{
                type: "text", 
                text: `✅ Document sent successfully! Message ID: ${result.message_id}`
              }]
            };
          }
        )
      ]
    });
  }

  // Инициализация с Telegram tools
  initializeTelegramTools(botToken, chatId) {
    if (botToken && chatId) {
      this.telegramTools = this.createTelegramTools(botToken, chatId);
      console.log('[ClaudeSDK] Telegram tools initialized');
    }
  }

  async startNewConversation(prompt) {
    const options = {
      model: this.options.model || 'sonnet',
      workingDirectory: this.options.workingDirectory
    };

    // Добавляем Telegram tools если доступны
    if (this.telegramTools) {
      options.mcpServers = {
        "telegram": this.telegramTools
      };

      options.canUseTool = async (toolName, input) => {
        // Разрешаем Telegram tools только в bot сессиях
        if (toolName.startsWith("send_telegram_")) {
          return { behavior: "allow", updatedInput: input };
        }
        return { behavior: "allow", updatedInput: input };
      };
    }

    // Запуск Claude Code SDK query
    this.currentQuery = query(prompt, options);
    
    // Обработка потока сообщений
    for await (const message of this.currentQuery) {
      this.emit('data', message);
      
      if (message.type === 'session_id') {
        this.sessionId = message.session_id;
        this.emit('session-id', this.sessionId);
      }
    }

    this.emit('end', { exitCode: 0 });
  }

  async continueConversation(prompt, sessionId) {
    const options = {
      model: this.options.model || 'sonnet', 
      workingDirectory: this.options.workingDirectory,
      continueSession: true
    };

    if (this.telegramTools) {
      options.mcpServers = { "telegram": this.telegramTools };
      options.canUseTool = async (toolName, input) => {
        if (toolName.startsWith("send_telegram_")) {
          return { behavior: "allow", updatedInput: input };
        }
        return { behavior: "allow", updatedInput: input };
      };
    }

    this.currentQuery = query(prompt, options);

    for await (const message of this.currentQuery) {
      this.emit('data', message);
    }

    this.emit('end', { exitCode: 0 });
  }

  async resumeSession(sessionId, prompt) {
    const options = {
      model: this.options.model || 'sonnet',
      workingDirectory: this.options.workingDirectory, 
      resumeSession: sessionId
    };

    if (this.telegramTools) {
      options.mcpServers = { "telegram": this.telegramTools };
      options.canUseTool = async (toolName, input) => {
        if (toolName.startsWith("send_telegram_")) {
          return { behavior: "allow", updatedInput: input };
        }
        return { behavior: "allow", updatedInput: input };
      };
    }

    this.currentQuery = query(prompt, options);

    for await (const message of this.currentQuery) {
      this.emit('data', message);
    }

    this.emit('end', { exitCode: 0 });
  }

  cancel() {
    if (this.currentQuery) {
      this.currentQuery.cancel();
      this.currentQuery = null;
    }
  }
}
```

#### **2.2 Event System Mapping**
```typescript
// Mapping событий между Stream и SDK
Stream Events → SDK Events:
- 'data' → 'message' (обработка потока)
- 'session-id' → сохранение sessionId
- 'end' → завершение обработки
- 'error' → обработка ошибок
- 'prompt-too-long' → авто-компактификация
```

---

### **PHASE 3: SessionManager Integration** ⏱️ *3-4 часа*

#### **3.1 Processor Factory в SessionManager**
```javascript
// SessionManager.js
class SessionManager {
  constructor(...) {
    // ...existing code
    this.useClaudeSDK = this.mainBot?.configManager?.getClaudeSDKEnabled() || false;
    console.log(`[SessionManager] Using Claude SDK: ${this.useClaudeSDK}`);
  }

  // Factory method для создания процессора
  createProcessor(userModel, workingDirectory, botToken, chatId) {
    if (this.useClaudeSDK) {
      const ClaudeSDKProcessor = require('./ClaudeSDKProcessor');
      const processor = new ClaudeSDKProcessor({
        model: userModel,
        workingDirectory: workingDirectory
      });
      
      // Инициализируем Telegram tools только для bot сессий
      if (botToken && chatId) {
        processor.initializeTelegramTools(botToken, chatId);
      }
      
      return processor;
    } else {
      // Fallback к текущей реализации
      const ClaudeStreamProcessor = require('./claude-stream-processor');
      return new ClaudeStreamProcessor({
        model: userModel,
        workingDirectory: workingDirectory
      });
    }
  }

  async createUserSession(userId, chatId) {
    const userModel = this.getUserModel(userId) || this.options.model;
    
    // Определяем параметры для Telegram integration
    const botToken = this.useClaudeSDK ? this.mainBot.bot.token : null;
    const telegramChatId = this.useClaudeSDK ? chatId.toString() : null;
    
    // Создаем процессор через factory
    const processor = this.createProcessor(
      userModel, 
      this.options.workingDirectory,
      botToken,
      telegramChatId
    );

    // ...остальной код остается без изменений
    this.setupProcessorEvents(processor, session);
    // ...
  }
}
```

#### **3.2 ConfigManager Extensions**
```javascript
// ConfigManager.js - добавить методы
class ConfigManager {
  // ...existing methods

  /**
   * Check if Claude SDK is enabled for this bot instance
   */
  getClaudeSDKEnabled() {
    const config = this.getConfig();
    return config.useClaudeSDK === true;
  }

  /**
   * Enable/disable Claude SDK
   */
  setClaudeSDKEnabled(enabled) {
    this.setValue('useClaudeSDK', enabled);
  }
}
```

---

### **PHASE 4: Testing & Validation** ⏱️ *2 часа*

#### **4.1 Feature Flag Testing**
```bash
# Тест 1: Bot1 с SDK (feature flag ON)
echo '{"useClaudeSDK": true}' > configs/bot1.json

# Тест 2: Bot2 без SDK (feature flag OFF или отсутствует)
echo '{"useClaudeSDK": false}' > configs/bot2.json

# Тест 3: Bot3 без изменений (fallback)
# configs/bot3.json остается без изменений
```

#### **4.2 Validation Checklist**
- [ ] Bot1: Claude SDK работает + Telegram tools доступны
- [ ] Bot2: Традиционный процессор работает (regression test)
- [ ] Bot3: Никаких изменений в поведении
- [ ] Bot4: Никаких изменений в поведении
- [ ] Все тесты проходят (никаких breaking changes)

---

### **PHASE 5: Advanced Features** ⏱️ *1-2 часа*

#### **5.1 Enhanced Telegram Tools**
```typescript
// Расширенные инструменты
tool("send_telegram_voice", "Send voice message", { ... }),
tool("send_telegram_audio", "Send audio file", { ... }),
tool("get_chat_info", "Get chat information", { ... })
```

#### **5.2 Permission Control**
```typescript
canUseTool: async (toolName, input) => {
  // Логика разрешений на основе пользователя
  if (toolName.startsWith("send_telegram_")) {
    const isAuthorized = await checkUserPermissions(userId);
    return isAuthorized ? 
      { behavior: "allow", updatedInput: input } : 
      { behavior: "deny", message: "Unauthorized" };
  }
  return { behavior: "allow", updatedInput: input };
}
```

## 🚫 **РИСКИ И MITIGATION**

### **🔴 Высокий риск: SDK API Changes**
- **Риск**: Claude Code SDK может измениться
- **Mitigation**: 
  - Зафиксировать версию в package.json: `"@anthropic-ai/claude-code": "1.0.94"`
  - Fallback на процессный подход через feature flag
  - Comprehensive testing перед продакшеном

### **🟡 Средний риск: Performance Differences**  
- **Риск**: SDK может работать медленнее/быстрее
- **Mitigation**:
  - A/B тестирование между подходами
  - Monitoring производительности
  - Возможность быстрого отката

### **🟢 Низкий риск: Event Handling**
- **Риск**: Различия в event потоках
- **Mitigation**: Abstraction layer через ProcessorInterface

## 📁 **ФАЙЛОВАЯ СТРУКТУРА**

### **Новые файлы:**
```
├── ProcessorInterface.js          # Абстракция для процессоров
├── ClaudeSDKProcessor.js          # SDK-based процессор
├── claude-sdk-tools/              # Custom tools
│   ├── TelegramTools.js          # Telegram integration tools
│   └── PermissionManager.js      # Разрешения для tools
└── tests/unit/
    ├── claude-sdk-processor.test.js
    └── telegram-tools.test.js
```

### **Модифицированные файлы:**
```
├── SessionManager.js             # + processor factory + feature flag
├── ConfigManager.js              # + SDK configuration methods  
├── package.json                  # + SDK dependencies
└── configs/bot1.json             # + useClaudeSDK: true
```

## ⚡ **БЫСТРАЯ РЕАЛИЗАЦИЯ (MVP)**

Для MVP достаточно:

1. **ClaudeSDKProcessor** с базовыми Telegram tools (send_image, send_document)
2. **Feature flag** в ConfigManager 
3. **Processor factory** в SessionManager
4. **Testing** на bot1

**Время реализации MVP: 4-6 часов**

## 🎯 **SUCCESS CRITERIA**

### ✅ **Функциональные требования:**
- [ ] Bot1: Пользователь может сказать "создай диаграмму и отправь в Telegram" → файл автоматически отправляется
- [ ] Bot1: send_telegram_image tool работает из Claude Code
- [ ] Bot1: send_telegram_document tool работает из Claude Code
- [ ] Bot2-4: Никаких изменений в поведении (regression test)
- [ ] Feature flag позволяет легко включать/выключать SDK

### ✅ **Технические требования:**
- [ ] Нет breaking changes для существующих ботов
- [ ] Все unit тесты проходят
- [ ] Performance не хуже текущего подхода
- [ ] Логи показывают четкое разделение SDK vs Stream подходов

### ✅ **Безопасность:**
- [ ] canUseTool callback работает правильно 
- [ ] Telegram tools доступны только в bot сессиях
- [ ] Terminal сессии не имеют доступа к Telegram tools
- [ ] Bot tokens не попадают в логи

## 🚀 **DEPLOYMENT STRATEGY**

### **Поэтапный rollout:**

1. **Week 1**: Реализация + testing на dev окружении
2. **Week 2**: Deploy на bot1 в production с feature flag ON
3. **Week 3**: Мониторинг + bug fixes если нужно
4. **Week 4**: Если все ок → можно расширять на другие боты

### **Rollback plan:**
```json
// Мгновенный откат через feature flag
{
  "useClaudeSDK": false  // ← одна строчка для отката
}
```

---

## 💡 **ЗАКЛЮЧЕНИЕ**

Этот план обеспечивает **безопасную миграцию** на Claude Code SDK с **нулевым риском** для существующих ботов. Использование **Strategy Pattern** и **Feature Flag** позволяет:

- ✅ Протестировать новый подход на bot1
- ✅ Оставить остальные боты без изменений
- ✅ Быстро откатиться если что-то пойдет не так
- ✅ Получить все преимущества SDK (Custom Tools, Type Safety, Performance)

**Готов к реализации!** 🚀