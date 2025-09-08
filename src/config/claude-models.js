/**
 * Claude Models Configuration
 * 
 * Centralized place to manage Claude model names.
 * Update this file when new models are released.
 * 
 * Last updated: 2025-01-07
 */

const CLAUDE_MODELS = {
    // Current production models
    SONNET: 'claude-sonnet-4-20250514',
    OPUS: 'claude-opus-4-1-20250805',
    
    // Legacy models (deprecated but may still work)
    LEGACY_SONNET: 'claude-3-5-sonnet-20241022',
    LEGACY_HAIKU: 'claude-3-5-haiku-20241022',
    LEGACY_OPUS: 'claude-3-opus-20240229'
};

/**
 * Get list of all available models (current first)
 * @returns {Array<string>} List of model names
 */
function getAvailableModels() {
    return [
        CLAUDE_MODELS.SONNET,
        CLAUDE_MODELS.OPUS,
        // Legacy models for backward compatibility
        CLAUDE_MODELS.LEGACY_SONNET,
        CLAUDE_MODELS.LEGACY_HAIKU,
        CLAUDE_MODELS.LEGACY_OPUS
    ];
}

/**
 * Get the default/recommended model
 * @returns {string} Default model name
 */
function getDefaultModel() {
    return CLAUDE_MODELS.SONNET;
}

/**
 * Check if a model name is valid
 * @param {string} modelName - Model name to validate
 * @returns {boolean} True if model is valid
 */
function isValidModel(modelName) {
    return getAvailableModels().includes(modelName);
}

/**
 * Get model display name for UI purposes
 * @param {string} modelName - Model name
 * @returns {string} Display name
 */
function getModelDisplayName(modelName) {
    const displayNames = {
        [CLAUDE_MODELS.SONNET]: 'Claude Sonnet 4 (Latest)',
        [CLAUDE_MODELS.OPUS]: 'Claude Opus 4.1 (Latest)',
        [CLAUDE_MODELS.LEGACY_SONNET]: 'Claude 3.5 Sonnet (Legacy)',
        [CLAUDE_MODELS.LEGACY_HAIKU]: 'Claude 3.5 Haiku (Legacy)',
        [CLAUDE_MODELS.LEGACY_OPUS]: 'Claude 3 Opus (Legacy)'
    };
    
    return displayNames[modelName] || modelName;
}

module.exports = {
    CLAUDE_MODELS,
    getAvailableModels,
    getDefaultModel,
    isValidModel,
    getModelDisplayName
};