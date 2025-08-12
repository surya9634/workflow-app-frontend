// work-flow/src/components/DashboardSections/Chats/instagram/InstagramChat.jsx
import React, { useState, useEffect } from 'react';
import { Search, Send, Plus, Link, LogIn, AlertCircle } from 'lucide-react';
import { socialMediaAPI } from '../../../../lib/api';
import ConnectionStatus from '../ConnectionStatus';

const InstagramChat = () => {
  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [messages, setMessages] = useState({});
  const [newMessage, setNewMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Fetch connected social media accounts
  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      const response = await socialMediaAPI.getAccounts();
      setAccounts(response.data.accounts);
      
      // Auto-select first account if available
      if (response.data.accounts.length > 0 && !selectedAccount) {
        setSelectedAccount(response.data.accounts[0]);
      }
    } catch (err) {
      setError('Failed to fetch accounts');
      console.error('Fetch accounts error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleConnectFacebook = async () => {
    try {
      const response = await socialMediaAPI.getFacebookAuthUrl();
      // Redirect to Facebook OAuth
      window.location.href = response.data.authUrl;
    } catch (err) {
      setError('Failed to connect Facebook account');
      console.error('Facebook connect error:', err);
    }
  };

  const handleDisconnectAccount = async (accountId) => {
    try {
      await socialMediaAPI.disconnectAccount(accountId);
      fetchAccounts(); // Refresh accounts list
    } catch (err) {
      setError('Failed to disconnect account');
      console.error('Disconnect account error:', err);
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedAccount) return;
    
    try {
      // In a real implementation, you would need to specify the recipientId
      // For now, we'll use a placeholder recipientId
      const recipientId = 'recipient_placeholder'; // This should be the actual recipient ID
      
      const response = await socialMediaAPI.sendInstagramMessage({
        accountId: selectedAccount.id,
        recipientId: recipientId,
        message: newMessage
      });
      
      if (response.data.success) {
        const messageData = {
          id: Date.now(),
          text: newMessage,
          sender: 'me',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        
        setMessages(prev => ({
          ...prev,
          [selectedAccount.id]: [...(prev[selectedAccount.id] || []), messageData]
        }));
        
        setNewMessage('');
      }
    } catch (err) {
      setError('Failed to send message');
      console.error('Send message error:', err);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-500"></div>
          <p className="mt-2 text-gray-600">Loading Instagram accounts...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center p-4 bg-red-50 rounded-lg max-w-md">
          <p className="text-red-600 font-medium">{error}</p>
          <button
            onClick={fetchAccounts}
            className="mt-3 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8">
        <ConnectionStatus isConnected={false} platform="Instagram" />
        <div className="bg-gradient-to-r from-purple-500 to-pink-500 p-4 rounded-full mb-6">
          <Instagram className="h-12 w-12 text-white" />
        </div>
        <h3 className="text-xl font-semibold text-gray-900 mb-2">Connect Instagram Account</h3>
        <p className="text-gray-600 text-center mb-6 max-w-md">
          Connect your Instagram business account to start managing messages and conversations.
        </p>
        <button
          onClick={handleConnectFacebook}
          className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all shadow-md"
        >
          <LogIn className="h-5 w-5" />
          Connect with Facebook
        </button>
        <p className="mt-4 text-sm text-gray-500 text-center max-w-md">
          Note: You'll need to connect through Facebook as Instagram accounts are managed through Facebook Business Manager.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex">
      {/* Left Panel - Account List */}
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Instagram Accounts</h2>
            <button
              onClick={handleConnectFacebook}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md"
              title="Add Account"
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>
          
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <input
              type="text"
              placeholder="Search accounts..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {accounts
            .filter(account => 
              account.accountName.toLowerCase().includes(searchTerm.toLowerCase())
            )
            .map((account) => (
              <div
                key={account._id}
                className={`p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 ${
                  selectedAccount?._id === account._id ? 'bg-purple-50 border-l-4 border-l-purple-500' : ''
                }`}
                onClick={() => setSelectedAccount(account)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="bg-gradient-to-r from-purple-500 to-pink-500 p-2 rounded-lg mr-3">
                      <Instagram className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <h3 className="font-medium text-gray-900">{account.accountName}</h3>
                      <p className="text-sm text-gray-500 capitalize">{account.platform}</p>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDisconnectAccount(account._id);
                    }}
                    className="text-gray-400 hover:text-red-500"
                    title="Disconnect Account"
                  >
                    <Link className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
        </div>
      </div>
      
      {/* Right Panel - Chat Interface */}
      <div className="flex-1 flex flex-col">
        {selectedAccount ? (
          <>
            {/* Chat Header */}
            <div className="bg-white border-b border-gray-200 p-4">
              <div className="flex items-center">
                <div className="bg-gradient-to-r from-purple-500 to-pink-500 p-2 rounded-lg mr-3">
                  <Instagram className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{selectedAccount.accountName}</h3>
                  <p className="text-sm text-gray-500">Instagram Business Account</p>
                </div>
              </div>
            </div>
            
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
              {messages[selectedAccount._id] && messages[selectedAccount._id].length > 0 ? (
                <div className="space-y-4">
                  {messages[selectedAccount._id].map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.sender === 'me' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-xs lg:max-w-md px-4 py-2 rounded-2xl ${
                          message.sender === 'me'
                            ? 'bg-purple-500 text-white rounded-br-md'
                            : 'bg-white text-gray-800 rounded-bl-md shadow-sm'
                        }`}
                      >
                        <p className="text-sm whitespace-pre-wrap">{message.text}</p>
                        <div className={`text-xs mt-1 ${message.sender === 'me' ? 'text-purple-100' : 'text-gray-500'}`}>
                          {message.timestamp}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-gray-500">
                  <Instagram className="h-12 w-12 mb-4" />
                  <p className="text-lg font-medium mb-2">No messages yet</p>
                  <p className="text-center max-w-md">
                    Start a conversation with your Instagram followers. Messages will appear here once received.
                  </p>
                </div>
              )}
            </div>
            
            {/* Message Input */}
            <div className="bg-white border-t border-gray-200 p-4">
              <div className="flex items-center space-x-3">
                <div className="flex-1 relative">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Type a message..."
                    className="w-full px-4 py-2 border border-gray-300 rounded-full focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                    onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  />
                </div>
                <button
                  onClick={handleSendMessage}
                  disabled={!newMessage.trim()}
                  className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 disabled:from-gray-300 disabled:to-gray-300 text-white p-2 rounded-full transition-all"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="h-full flex items-center justify-center">
            <div className="text-center p-8">
              <Instagram className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-xl font-medium text-gray-900 mb-2">Select an Account</h3>
              <p className="text-gray-500">
                Choose an Instagram account from the list to start managing messages.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default InstagramChat;