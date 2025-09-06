# Claude Code SDK Migration Plan - Simple Architecture Migration
## От spawn('claude') к SDK без новых фич

## 🎯 **Единственная цель**

**Заменить ClaudeStreamProcessor (spawn claude) на ClaudeSDKProcessor (SDK) с нулевыми изменениями в функционале.**

- ✅ Все текущие функции работают **точно так же**
- ✅ Никаких новых фич (Telegram tools и т.д.)
- ✅ Только bot1 переходит на SDK
- ✅ Bot2-4 остаются на spawn подходе

## 📊 **Что меняется под капотом**

### **ДО (текущая архитектура):**
```bash
SessionManager → ClaudeStreamProcessor → spawn('claude', args) → STDIO → Stream parsing
```

### **ПОСЛЕ (целевая архитектура):**
```typescript
SessionManager → ClaudeSDKProcessor → SDK.query(prompt, options) → Event stream
```

**Все остальное остается ТОЧНО ТАК ЖЕ!**

## 🔍 **Анализ текущего ClaudeStreamProcessor**

### **Ключевые методы для миграции:**
```javascript
// claude-stream-processor.js - что нужно заменить
class ClaudeStreamProcessor {
  async startNewConversation(prompt)     // → SDK.query(prompt)
  async continueConversation(prompt)     // → SDK.query(prompt, {continue: true})
  async resumeSession(sessionId, prompt) // → SDK.query(prompt, {resume: sessionId})
  
  // События, которые должны остаться:
  this.emit('data', message)     // Поток сообщений
  this.emit('session-id', id)    // ID сессии
  this.emit('end', {exitCode})   // Завершение
  this.emit('error', error)      // Ошибки
  this.emit('prompt-too-long')   // Авто-компакт
}
```

### **Параметры командной строки для миграции:**
```javascript
// Текущие аргументы claude
['-p', '--model', model, '--output-format', 'stream-json', '--verbose', '--dangerously-skip-permissions', prompt]
['-c', '-p', ...] // continue
['-r', sessionId, '-p', ...] // resume

// SDK эквиваленты
{
  model: model,
  outputFormat: 'stream-json',
  verbose: true,
  skipPermissions: true
}
```

## 📋 **УПРОЩЕННЫЙ ПЛАН МИГРАЦИИ**

### **PHASE 1: SDK Processor Implementation** ⏱️ *2-3 часа*

#### **1.1 Установить SDK**
```bash
npm install @anthropic-ai/claude-code
```

#### **1.2 Создать ClaudeSDKProcessor**
```typescript
// ClaudeSDKProcessor.js
const { query } = require('@anthropic-ai/claude-code');
const { EventEmitter } = require('events');

class ClaudeSDKProcessor extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = {
      model: 'sonnet',
      workingDirectory: process.cwd(),
      verbose: true,
      skipPermissions: true,
      ...options
    };
    
    this.currentQuery = null;
    this.sessionId = null;
    this.isProcessing = false;
  }

  async startNewConversation(prompt) {
    if (this.isProcessing) {
      throw new Error('Already processing a request');
    }

    this.isProcessing = true;

    const options = {
      model: this.options.model,
      workingDirectory: this.options.workingDirectory,
      outputFormat: 'stream-json',
      verbose: this.options.verbose,
      skipPermissions: this.options.skipPermissions
    };

    try {
      this.currentQuery = query(prompt, options);
      
      for await (const message of this.currentQuery) {
        // Эмулируем события ClaudeStreamProcessor
        this.emit('data', message);
        
        // Сохраняем session ID
        if (message.type === 'session_id') {
          this.sessionId = message.session_id;
          this.emit('session-id', this.sessionId);
        }
      }

      this.emit('end', { exitCode: 0 });
    } catch (error) {
      this.emit('error', error);
    } finally {
      this.isProcessing = false;
      this.currentQuery = null;
    }
  }

  async continueConversation(prompt, sessionId = null) {
    if (this.isProcessing) {
      throw new Error('Already processing a request');
    }

    this.isProcessing = true;

    const options = {
      model: this.options.model,
      workingDirectory: this.options.workingDirectory,
      outputFormat: 'stream-json',
      verbose: this.options.verbose,
      skipPermissions: this.options.skipPermissions,
      continueSession: true  // SDK equivalent of -c flag
    };

    try {
      this.currentQuery = query(prompt, options);
      
      for await (const message of this.currentQuery) {
        this.emit('data', message);
      }

      this.emit('end', { exitCode: 0 });
    } catch (error) {
      this.emit('error', error);
    } finally {
      this.isProcessing = false;
      this.currentQuery = null;
    }
  }

  async resumeSession(sessionId, prompt) {
    if (this.isProcessing) {
      throw new Error('Already processing a request');
    }

    this.isProcessing = true;

    const options = {
      model: this.options.model,
      workingDirectory: this.options.workingDirectory,
      outputFormat: 'stream-json', 
      verbose: this.options.verbose,
      skipPermissions: this.options.skipPermissions,
      resumeSession: sessionId  // SDK equivalent of -r sessionId
    };

    try {
      this.currentQuery = query(prompt, options);
      
      for await (const message of this.currentQuery) {
        this.emit('data', message);
      }

      this.emit('end', { exitCode: 0 });
    } catch (error) {
      this.emit('error', error);
    } finally {
      this.isProcessing = false;
      this.currentQuery = null;
    }
  }

  cancel() {
    if (this.currentQuery && this.currentQuery.cancel) {
      this.currentQuery.cancel();
      this.currentQuery = null;
      this.isProcessing = false;
    }
  }

  // Методы совместимости с текущим API
  getLastClaudeArgs() {
    // Для тестов - возвращаем эквивалент аргументов
    return ['-p', '--model', this.options.model, '--output-format', 'stream-json'];
  }

  getLastClaudeOptions() {
    return {
      cwd: this.options.workingDirectory,
      stdio: ['ignore', 'pipe', 'pipe']
    };
  }
}

module.exports = ClaudeSDKProcessor;
```

### **PHASE 2: SessionManager Integration** ⏱️ *1-2 часа*

#### **2.1 Добавить feature flag**
```javascript
// ConfigManager.js - добавить метод
getClaudeSDKEnabled() {
  const config = this.getConfig();
  return config.useClaudeSDK === true;
}
```

#### **2.2 Processor Factory в SessionManager**
```javascript
// SessionManager.js - изменить метод createUserSession
async createUserSession(userId, chatId) {
  const userModel = this.getUserModel(userId) || this.options.model;
  
  // Определяем тип процессора через feature flag
  const useSDK = this.mainBot?.configManager?.getClaudeSDKEnabled() || false;
  
  let processor;
  if (useSDK) {
    console.log(`[SessionManager] Using Claude SDK for user ${userId}`);
    const ClaudeSDKProcessor = require('./ClaudeSDKProcessor');
    processor = new ClaudeSDKProcessor({
      model: userModel,
      workingDirectory: this.options.workingDirectory
    });
  } else {
    console.log(`[SessionManager] Using Claude Stream for user ${userId}`);
    const ClaudeStreamProcessor = require('./claude-stream-processor');
    processor = new ClaudeStreamProcessor({
      model: userModel,
      workingDirectory: this.options.workingDirectory
    });
  }

  // Весь остальной код остается БЕЗ ИЗМЕНЕНИЙ!
  // setupProcessorEvents, session creation, etc.
  
  this.setupProcessorEvents(processor, session);
  this.userSessions.set(userId, session);
  this.activeProcessors.add(processor);
  return session;
}
```

### **PHASE 3: Configuration** ⏱️ *10 минут*

#### **3.1 Feature flag для bot1**
```json
// configs/bot1.json
{
  "useClaudeSDK": true,
  "adminUserId": "...",
  "botToken": "..."
}
```

#### **3.2 Bot2-4 остаются без изменений**
```json  
// configs/bot2.json, bot3.json, bot4.json
// НЕ ДОБАВЛЯЕМ useClaudeSDK - defaults to false
```

### **PHASE 4: Testing** ⏱️ *1 час*

#### **4.1 Unit Tests**
```javascript
// tests/unit/claude-sdk-processor.test.js
describe('ClaudeSDKProcessor', () => {
  test('should have same interface as ClaudeStreamProcessor', () => {
    const processor = new ClaudeSDKProcessor();
    
    // Проверяем что все методы на месте
    expect(processor.startNewConversation).toBeDefined();
    expect(processor.continueConversation).toBeDefined();
    expect(processor.resumeSession).toBeDefined();
    expect(processor.cancel).toBeDefined();
  });

  test('should emit same events as stream processor', async () => {
    // Mock тест на события
  });
});
```

#### **4.2 Integration Tests**
```bash
# Тест bot1 (SDK)
NODE_ENV=test npm test -- --testNamePattern="bot1.*SDK"

# Тест bot2 (Stream - regression)  
NODE_ENV=test npm test -- --testNamePattern="bot2.*Stream"
```

## 🚫 **ЧТО ИСКЛЮЧАЕМ**

### ❌ **НЕ РЕАЛИЗУЕМ (убираем из скоупа):**
- Telegram custom tools (send_image, send_document, etc.)
- MCP servers
- canUseTool callbacks
- Новые возможности SDK
- Дополнительные фичи

### ✅ **ФОКУС ТОЛЬКО НА:**
- Замена spawn('claude') → SDK.query()
- Сохранение точно тех же событий
- Feature flag для безопасности
- Совместимость API

## 📊 **СРАВНЕНИЕ РИСКОВ**

| **Риск** | **Процессный подход** | **SDK подход** |
|---|---|---|
| **Производительность** | spawn() overhead | ✅ Нативный SDK |
| **Надежность** | Process crashes | ✅ In-process |
| **Debugging** | STDIO parsing | ✅ Прямые события |
| **Maintenance** | CLI аргументы | ✅ Typed options |

## ⏱️ **ВРЕМЯ РЕАЛИЗАЦИИ**

- **Phase 1**: ClaudeSDKProcessor - 2-3 часа
- **Phase 2**: SessionManager integration - 1-2 часа  
- **Phase 3**: Configuration - 10 минут
- **Phase 4**: Testing - 1 час

**Общее время: 4-6 часов**

## ✅ **SUCCESS CRITERIA**

### **Функциональные требования:**
- [ ] Bot1: Все команды работают точно так же (status, new_session, etc.)
- [ ] Bot1: Сессии создаются и продолжаются без различий
- [ ] Bot1: Voice сообщения обрабатываются так же
- [ ] Bot1: File uploads работают так же
- [ ] Bot1: Git operations работают так же
- [ ] Bot2-4: Никаких изменений в поведении

### **Технические требования:**  
- [ ] Все события (data, session-id, end, error) работают идентично
- [ ] SessionManager API остается неизменным
- [ ] Все unit тесты проходят
- [ ] Performance не хуже (скорее лучше)

### **Безопасность:**
- [ ] Feature flag позволяет мгновенный откат
- [ ] Bot tokens и sensitive data не меняют обработку
- [ ] Логи показывают четко: SDK vs Stream

## 🚀 **DEPLOYMENT STRATEGY**

### **Поэтапный rollout:**
1. **Deploy на dev** с bot1 feature flag
2. **Тестирование** всех основных сценариев
3. **Production bot1** с feature flag ON
4. **Monitoring** 24-48 часов
5. **Rollback или expand** в зависимости от результатов

### **Instant rollback:**
```json
// Одна строчка для отката
{ "useClaudeSDK": false }
```

---

## 💡 **ЗАКЛЮЧЕНИЕ**

**Максимально простая и безопасная миграция:**

- ✅ **0 новых фич** - только замена архитектуры
- ✅ **0 изменений API** - все методы остаются те же  
- ✅ **0 риска для bot2-4** - они остаются на spawn
- ✅ **1 feature flag** для контроля
- ✅ **4-6 часов** реализации

**Готов начинать реализацию когда скажете!** 🚀