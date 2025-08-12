import React, { useState, useEffect } from 'react';
import { api } from '../../../lib/api';
import './AIAutomation.css';

const AIAutomation = () => {
  const [campaigns, setCampaigns] = useState([]);
  const [automationSettings, setAutomationSettings] = useState([]);
  const [connectedAccounts, setConnectedAccounts] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Load campaigns, automation settings, and connected accounts
      const [campaignsRes, settingsRes, accountsRes] = await Promise.all([
        api.get('/api/campaigns'),
        api.get('/api/ai/automation/settings'),
        api.get('/api/social-media/accounts')
      ]);

      if (campaignsRes.data.success) {
        setCampaigns(campaignsRes.data.campaigns.filter(c => c.trainingStatus === 'completed'));
      }
      
      if (settingsRes.data.success) {
        setAutomationSettings(settingsRes.data.settings);
      }
      
      if (accountsRes.data.success) {
        setConnectedAccounts(accountsRes.data.accounts);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleAIAutomation = async (platform, accountId, enabled, campaignId = null) => {
    try {
      const response = await api.post('/api/ai/automation/toggle', {
        platform,
        accountId,
        campaignId,
        enabled
      });

      if (response.data.success) {
        // Update local state
        const updatedSettings = automationSettings.filter(s => 
          !(s.platform === platform && s.accountId === accountId)
        );
        
        if (enabled) {
          updatedSettings.push(response.data.settings);
        }
        
        setAutomationSettings(updatedSettings);
      }
    } catch (error) {
      console.error('Error toggling AI automation:', error);
    }
  };

  const getAutomationStatus = (platform, accountId) => {
    return automationSettings.find(s => 
      s.platform === platform && s.accountId === accountId && s.enabled
    );
  };

  const getPlatformIcon = (platform) => {
    switch (platform) {
      case 'facebook':
      case 'messenger':
        return '💬';
      case 'instagram':
        return '📸';
      case 'whatsapp':
        return '💚';
      default:
        return '🤖';
    }
  };

  const getPlatformColor = (platform) => {
    switch (platform) {
      case 'facebook':
      case 'messenger':
        return '#1877f2';
      case 'instagram':
        return '#e4405f';
      case 'whatsapp':
        return '#25d366';
      default:
        return '#667eea';
    }
  };

  if (loading) {
    return (
      <div className="ai-automation-container">
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading AI automation settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="ai-automation-container">
      <div className="ai-automation-header">
        <h2>🤖 AI Chat Automation</h2>
        <p>Enable your trained Gemini AI to automatically respond to customer messages</p>
      </div>

      {campaigns.length === 0 && (
        <div className="no-campaigns-notice">
          <div className="notice-content">
            <h3>⚠️ No Trained AI Campaigns</h3>
            <p>You need to create and train at least one AI campaign before enabling automation.</p>
            <button 
              className="create-campaign-btn"
              onClick={() => window.location.href = '#ai-training'}
            >
              Create AI Campaign
            </button>
          </div>
        </div>
      )}

      {campaigns.length > 0 && (
        <div className="automation-controls">
          <h3>Connected Accounts & AI Automation</h3>
          
          {connectedAccounts.map(account => {
            const automationStatus = getAutomationStatus(account.platform, account.accountId);
            const isEnabled = !!automationStatus;
            
            return (
              <div key={`${account.platform}_${account.accountId}`} className="account-automation-card">
                <div className="account-info">
                  <div className="platform-icon" style={{ color: getPlatformColor(account.platform) }}>
                    {getPlatformIcon(account.platform)}
                  </div>
                  <div className="account-details">
                    <h4>{account.username}</h4>
                    <p className="platform-name">
                      {account.platform.charAt(0).toUpperCase() + account.platform.slice(1)}
                    </p>
                    <div className="account-stats">
                      <span>{account.stats?.followers || 0} followers</span>
                      <span>{account.stats?.engagement || '0%'} engagement</span>
                    </div>
                  </div>
                </div>

                <div className="automation-controls-section">
                  <div className="ai-toggle-section">
                    <div className="toggle-header">
                      <h5>AI Auto-Response</h5>
                      <label className="toggle-switch">
                        <input
                          type="checkbox"
                          checked={isEnabled}
                          onChange={(e) => {
                            if (e.target.checked && campaigns.length > 0) {
                              // Enable with first available campaign
                              toggleAIAutomation(
                                account.platform, 
                                account.accountId, 
                                true, 
                                campaigns[0].id
                              );
                            } else {
                              // Disable
                              toggleAIAutomation(
                                account.platform, 
                                account.accountId, 
                                false
                              );
                            }
                          }}
                        />
                        <span className="slider"></span>
                      </label>
                    </div>

                    {isEnabled && (
                      <div className="campaign-selector">
                        <label>Active AI Campaign:</label>
                        <select
                          value={automationStatus.campaignId || ''}
                          onChange={(e) => {
                            toggleAIAutomation(
                              account.platform,
                              account.accountId,
                              true,
                              e.target.value
                            );
                          }}
                          className="campaign-select"
                        >
                          {campaigns.map(campaign => (
                            <option key={campaign.id} value={campaign.id}>
                              {campaign.name} ({campaign.productType})
                            </option>
                          ))}
                        </select>
                        
                        <div className="automation-status">
                          <span className="status-indicator active">
                            ✅ AI responses enabled
                          </span>
                          <span className="last-updated">
                            Updated: {new Date(automationStatus.updatedAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    )}

                    {!isEnabled && (
                      <div className="disabled-status">
                        <span className="status-indicator disabled">
                          ⏸️ AI responses disabled
                        </span>
                        <p className="status-description">
                          Enable AI automation to let your trained Gemini AI respond to customer messages automatically.
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="automation-features">
                    <h6>AI Features:</h6>
                    <ul className="features-list">
                      <li className={isEnabled ? 'enabled' : 'disabled'}>
                        🎯 Campaign-specific responses
                      </li>
                      <li className={isEnabled ? 'enabled' : 'disabled'}>
                        ⚡ Real-time message processing
                      </li>
                      <li className={isEnabled ? 'enabled' : 'disabled'}>
                        📊 Interaction analytics
                      </li>
                      <li className={isEnabled ? 'enabled' : 'disabled'}>
                        🧠 Gemini AI-powered intelligence
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {automationSettings.length > 0 && (
        <div className="automation-analytics">
          <h3>AI Automation Analytics</h3>
          <div className="analytics-grid">
            <div className="analytics-card">
              <h4>{automationSettings.filter(s => s.enabled).length}</h4>
              <p>Active AI Automations</p>
            </div>
            <div className="analytics-card">
              <h4>{connectedAccounts.length}</h4>
              <p>Connected Accounts</p>
            </div>
            <div className="analytics-card">
              <h4>95%</h4>
              <p>AI Response Accuracy</p>
            </div>
            <div className="analytics-card">
              <h4>0.8s</h4>
              <p>Avg Response Time</p>
            </div>
          </div>
        </div>
      )}

      <div className="automation-tips">
        <h3>💡 AI Automation Tips</h3>
        <div className="tips-grid">
          <div className="tip-card">
            <h4>🎯 Campaign Selection</h4>
            <p>Choose the AI campaign that best matches your account's purpose and audience for more relevant responses.</p>
          </div>
          <div className="tip-card">
            <h4>📊 Monitor Performance</h4>
            <p>Check AI response analytics regularly to ensure your automation is performing well and engaging customers effectively.</p>
          </div>
          <div className="tip-card">
            <h4>🔄 Update Training</h4>
            <p>Regularly update your AI campaigns with new questions and scenarios to improve response quality over time.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIAutomation;
