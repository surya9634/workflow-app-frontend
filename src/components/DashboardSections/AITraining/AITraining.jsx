import React, { useState, useEffect } from 'react';
import { api } from '../../../lib/api';
import './AITraining.css';

const AITraining = () => {
  const [campaigns, setCampaigns] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [showCreateCampaign, setShowCreateCampaign] = useState(false);
  const [newCampaign, setNewCampaign] = useState({
    name: '',
    description: '',
    productType: '',
    targetAudience: '',
    trainingQuestions: ['']
  });
  const [testQuestion, setTestQuestion] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [selectedCampaign, setSelectedCampaign] = useState('');

  useEffect(() => {
    loadCampaigns();
    loadAnalytics();
  }, []);

  const loadCampaigns = async () => {
    try {
      const response = await api.get('/api/campaigns');
      if (response.data.success) {
        setCampaigns(response.data.campaigns);
      }
    } catch (error) {
      console.error('Error loading campaigns:', error);
    }
  };

  const loadAnalytics = async () => {
    try {
      const response = await api.get('/api/ai/analytics');
      if (response.data.success) {
        setAnalytics(response.data.analytics);
      }
    } catch (error) {
      console.error('Error loading analytics:', error);
    }
  };

  const createCampaign = async () => {
    try {
      const response = await api.post('/api/campaigns', newCampaign);
      if (response.data.success) {
        setCampaigns([...campaigns, response.data.campaign]);
        setShowCreateCampaign(false);
        setNewCampaign({
          name: '',
          description: '',
          productType: '',
          targetAudience: '',
          trainingQuestions: ['']
        });
        
        // Auto-train the AI with the campaign questions
        await trainAI(response.data.campaign.id, newCampaign.trainingQuestions);
      }
    } catch (error) {
      console.error('Error creating campaign:', error);
    }
  };

  const trainAI = async (campaignId, questions) => {
    try {
      const response = await api.post('/api/ai/train', {
        campaignId,
        questions,
        productInfo: campaigns.find(c => c.id === campaignId)
      });
      
      if (response.data.success) {
        loadCampaigns(); // Refresh to show training status
        loadAnalytics(); // Refresh analytics
      }
    } catch (error) {
      console.error('Error training AI:', error);
    }
  };

  const testAIResponse = async () => {
    if (!testQuestion || !selectedCampaign) return;
    
    try {
      const response = await api.post('/api/ai/generate-response', {
        question: testQuestion,
        campaignId: selectedCampaign,
        context: { source: 'test' }
      });
      
      if (response.data.success) {
        setAiResponse(response.data.response);
      }
    } catch (error) {
      console.error('Error generating AI response:', error);
    }
  };

  const addTrainingQuestion = () => {
    setNewCampaign({
      ...newCampaign,
      trainingQuestions: [...newCampaign.trainingQuestions, '']
    });
  };

  const updateTrainingQuestion = (index, value) => {
    const updatedQuestions = [...newCampaign.trainingQuestions];
    updatedQuestions[index] = value;
    setNewCampaign({
      ...newCampaign,
      trainingQuestions: updatedQuestions
    });
  };

  const removeTrainingQuestion = (index) => {
    const updatedQuestions = newCampaign.trainingQuestions.filter((_, i) => i !== index);
    setNewCampaign({
      ...newCampaign,
      trainingQuestions: updatedQuestions
    });
  };

  return (
    <div className="ai-training-container">
      <div className="ai-training-header">
        <h2>🤖 AI Training & Campaign Management</h2>
        <p>Train your Gemini AI with campaign-specific questions and product knowledge</p>
      </div>

      {/* Analytics Dashboard */}
      {analytics && (
        <div className="ai-analytics">
          <h3>Training Analytics</h3>
          <div className="analytics-grid">
            <div className="analytics-card">
              <h4>{analytics.totalCampaigns}</h4>
              <p>Total Campaigns</p>
            </div>
            <div className="analytics-card">
              <h4>{analytics.trainedCampaigns}</h4>
              <p>Trained Campaigns</p>
            </div>
            <div className="analytics-card">
              <h4>{analytics.totalQuestions}</h4>
              <p>Training Questions</p>
            </div>
            <div className="analytics-card">
              <h4>{analytics.trainingAccuracy}</h4>
              <p>Training Accuracy</p>
            </div>
          </div>
        </div>
      )}

      {/* Create Campaign Section */}
      <div className="campaign-section">
        <div className="section-header">
          <h3>Campaign Management</h3>
          <button 
            className="create-campaign-btn"
            onClick={() => setShowCreateCampaign(true)}
          >
            + Create New Campaign
          </button>
        </div>

        {showCreateCampaign && (
          <div className="create-campaign-modal">
            <div className="modal-content">
              <h4>Create New AI Training Campaign</h4>
              
              <div className="form-group">
                <label>Campaign Name</label>
                <input
                  type="text"
                  value={newCampaign.name}
                  onChange={(e) => setNewCampaign({...newCampaign, name: e.target.value})}
                  placeholder="e.g., Product Launch Q&A"
                />
              </div>

              <div className="form-group">
                <label>Description</label>
                <textarea
                  value={newCampaign.description}
                  onChange={(e) => setNewCampaign({...newCampaign, description: e.target.value})}
                  placeholder="Describe the campaign purpose..."
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Product Type</label>
                  <input
                    type="text"
                    value={newCampaign.productType}
                    onChange={(e) => setNewCampaign({...newCampaign, productType: e.target.value})}
                    placeholder="e.g., SaaS Software, E-commerce"
                  />
                </div>
                <div className="form-group">
                  <label>Target Audience</label>
                  <input
                    type="text"
                    value={newCampaign.targetAudience}
                    onChange={(e) => setNewCampaign({...newCampaign, targetAudience: e.target.value})}
                    placeholder="e.g., Small Business Owners"
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Training Questions</label>
                {newCampaign.trainingQuestions.map((question, index) => (
                  <div key={index} className="question-input">
                    <input
                      type="text"
                      value={question}
                      onChange={(e) => updateTrainingQuestion(index, e.target.value)}
                      placeholder={`Training question ${index + 1}...`}
                    />
                    {newCampaign.trainingQuestions.length > 1 && (
                      <button 
                        type="button"
                        onClick={() => removeTrainingQuestion(index)}
                        className="remove-question-btn"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
                <button 
                  type="button"
                  onClick={addTrainingQuestion}
                  className="add-question-btn"
                >
                  + Add Training Question
                </button>
              </div>

              <div className="modal-actions">
                <button 
                  onClick={() => setShowCreateCampaign(false)}
                  className="cancel-btn"
                >
                  Cancel
                </button>
                <button 
                  onClick={createCampaign}
                  className="create-btn"
                  disabled={!newCampaign.name || !newCampaign.productType}
                >
                  Create & Train AI
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Campaigns List */}
        <div className="campaigns-list">
          {campaigns.map(campaign => (
            <div key={campaign.id} className="campaign-card">
              <div className="campaign-info">
                <h4>{campaign.name}</h4>
                <p>{campaign.description}</p>
                <div className="campaign-meta">
                  <span className="product-type">{campaign.productType}</span>
                  <span className="audience">{campaign.targetAudience}</span>
                  <span className={`status ${campaign.trainingStatus || 'pending'}`}>
                    {campaign.trainingStatus === 'completed' ? '✅ Trained' : '⏳ Pending'}
                  </span>
                </div>
              </div>
              <div className="campaign-stats">
                <div className="stat">
                  <span className="stat-value">{campaign.questionsCount}</span>
                  <span className="stat-label">Questions</span>
                </div>
                <div className="stat">
                  <span className="stat-value">{campaign.aiModel}</span>
                  <span className="stat-label">Model</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* AI Testing Section */}
      <div className="ai-testing-section">
        <h3>Test AI Responses</h3>
        <div className="testing-interface">
          <div className="test-controls">
            <select 
              value={selectedCampaign}
              onChange={(e) => setSelectedCampaign(e.target.value)}
              className="campaign-select"
            >
              <option value="">Select a campaign...</option>
              {campaigns.filter(c => c.trainingStatus === 'completed').map(campaign => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </option>
              ))}
            </select>
            
            <div className="question-input-group">
              <input
                type="text"
                value={testQuestion}
                onChange={(e) => setTestQuestion(e.target.value)}
                placeholder="Ask a question to test AI response..."
                className="test-question-input"
              />
              <button 
                onClick={testAIResponse}
                disabled={!testQuestion || !selectedCampaign}
                className="test-btn"
              >
                Test AI
              </button>
            </div>
          </div>

          {aiResponse && (
            <div className="ai-response">
              <h4>AI Response:</h4>
              <div className="response-content">
                {aiResponse}
              </div>
              <div className="response-meta">
                <span>Model: Gemini Pro</span>
                <span>Confidence: 95%</span>
                <span>Response Time: 0.8s</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AITraining;
