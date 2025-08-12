import React, { useState, useEffect } from 'react';
import { Plus, AlertCircle } from 'lucide-react';
import ConnectionCard from './ConnectionCard';
import AutomationCard from './AutomationCard';
import ConnectionModal from './ConnectionModal';
import AutomationModal from './AutomationModal';
import { platforms } from '../../data/platformData';
import { socialMediaAPI } from '../../../lib/api';

const Integration  = () => {
  const [connectedAccounts, setConnectedAccounts] = useState([]);
  const [automations, setAutomations] = useState([]);
  const [showConnectionModal, setShowConnectionModal] = useState(false);
  const [showAutomationModal, setShowAutomationModal] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState(null);
  const [editingConnection, setEditingConnection] = useState(null);
  const [editingAutomation, setEditingAutomation] = useState(null);

  useEffect(() => {
    // Load connections from backend
    loadConnections();
  }, []);

  const loadConnections = async () => {
    try {
      const response = await socialMediaAPI.getAccounts();
      if (response.data.success) {
        setConnectedAccounts(response.data.accounts);
      }
    } catch (error) {
      console.error('Error loading connections:', error);
    }
  };

  const handleAddConnection = (platform) => {
    setSelectedPlatform(platform);
    setEditingConnection(null);
    setShowConnectionModal(true);
  };

  const handleEditConnection = (connection) => {
    setEditingConnection(connection);
    setSelectedPlatform(connection.platform);
    setShowConnectionModal(true);
  };

  const handleDisconnect = async (connectionId) => {
    try {
      await socialMediaAPI.disconnectAccount(connectionId);
      // Refresh connections from backend
      await loadConnections();
    } catch (error) {
      console.error('Error disconnecting account:', error);
    }
  };

  const handleSaveConnection = async (connectionData) => {
    try {
      // Refresh connections from backend
      await loadConnections();
      setShowConnectionModal(false);
    } catch (error) {
      console.error('Error saving connection:', error);
    }
  };

  const handleCreateAutomation = () => {
    setEditingAutomation(null);
    setShowAutomationModal(true);
  };

  const handleEditAutomation = (automation) => {
    setEditingAutomation(automation);
    setShowAutomationModal(true);
  };

  const handleToggleAutomation = (automationId) => {
    setAutomations(prev => 
      prev.map(auto => 
        auto.id === automationId ? { ...auto, active: !auto.active } : auto
      )
    );
  };

  const handleDeleteAutomation = (automationId) => {
    setAutomations(prev => prev.filter(auto => auto.id !== automationId));
  };

  const handleSaveAutomation = (automationData) => {
    if (editingAutomation) {
      setAutomations(prev => 
        prev.map(auto => auto.id === editingAutomation.id ? { ...auto, ...automationData } : auto)
      );
    } else {
      setAutomations(prev => [...prev, { 
        id: Date.now(), 
        ...automationData,
        active: true,
        createdAt: new Date().toISOString()
      }]);
    }
    setShowAutomationModal(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Integrations</h1>
          <p className="text-gray-600">Connect your social platforms and create AI-powered automations</p>
        </div>

        {/* Connected Accounts Section */}
        <div className="mb-12">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-900">Connected Accounts</h2>
          </div>

          {/* Platform Connection Buttons */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {Object.entries(platforms).map(([key, platform]) => {
              const Icon = platform.icon;
              const hasConnection = connectedAccounts.some(acc => acc.platform === key);
              
              return (
                <button
                  key={key}
                  onClick={() => handleAddConnection(key)}
                  className={`relative p-6 rounded-xl border-2 border-dashed transition-all duration-200 ${
                    hasConnection 
                      ? 'border-gray-300 hover:border-gray-400' 
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                >
                  <div className="flex flex-col items-center gap-3">
                    <div className={`p-4 rounded-lg ${platform.color} text-white`}>
                      <Icon size={28} />
                    </div>
                    <div className="text-center">
                      <h3 className="font-semibold text-gray-900">{platform.name}</h3>
                      <p className="text-sm text-gray-500 mt-1">
                        {hasConnection ? 'Add another account' : 'Connect account'}
                      </p>
                    </div>
                  </div>
                  {hasConnection && (
                    <div className="absolute top-3 right-3 w-3 h-3 bg-green-500 rounded-full"></div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Connected Account Cards */}
          {connectedAccounts.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {connectedAccounts.map(connection => (
                <ConnectionCard
                  key={connection.id}
                  connection={connection}
                  onEdit={handleEditConnection}
                  onDisconnect={handleDisconnect}
                />
              ))}
            </div>
          )}
        </div>

        {/* Automations Section */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-900">AI Automations</h2>
            <button
              onClick={handleCreateAutomation}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus size={20} />
              Create Automation
            </button>
          </div>

          {automations.length === 0 ? (
            <div className="bg-white rounded-xl border-2 border-dashed border-gray-300 p-12 text-center">
              <div className="max-w-sm mx-auto">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Plus size={24} className="text-gray-400" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">No automations yet</h3>
                <p className="text-gray-500 mb-4">
                  Create your first AI automation to start engaging with your audience automatically
                </p>
                <button
                  onClick={handleCreateAutomation}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Create Automation
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {automations.map(automation => (
                <AutomationCard
                  key={automation.id}
                  automation={automation}
                  onToggle={handleToggleAutomation}
                  onEdit={handleEditAutomation}
                  onDelete={handleDeleteAutomation}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showConnectionModal && (
        <ConnectionModal
          platform={selectedPlatform}
          editingConnection={editingConnection}
          onClose={() => setShowConnectionModal(false)}
          onSave={handleSaveConnection}
        />
      )}

      {showAutomationModal && (
        <AutomationModal
          editingAutomation={editingAutomation}
          connectedAccounts={connectedAccounts}
          onClose={() => setShowAutomationModal(false)}
          onSave={handleSaveAutomation}
        />
      )}
    </div>
  );
};

export default Integration;