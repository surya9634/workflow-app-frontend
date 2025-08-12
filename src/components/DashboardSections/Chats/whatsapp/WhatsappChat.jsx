import React, { useState, useEffect } from 'react';
import ChatList from './ChatList';
import ChatWindow from './ChatWindow';
import ChatFilter from './ChatFilter';
import CustomerDetails from './CustomerDetails';
import { AlertCircle } from 'lucide-react';
import ConnectionStatus from '../ConnectionStatus';
import { conversationAPI } from '../../../../lib/api';

// Customer data will be fetched from the API
const customerData = {};

function WhatsappChat() {
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [aiMode, setAiMode] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(true);

  useEffect(() => {
    // Fetch chats from backend
    const fetchChats = async () => {
      try {
        setLoading(true);
        const response = await conversationAPI.getConversations();
        if (response.data.success) {
          // Transform the conversation data to match the expected format
          const transformedChats = response.data.conversations.map(conversation => ({
            id: conversation.id,
            name: conversation.name,
            lastMessage: conversation.lastMessage,
            time: conversation.timestamp,
            status: conversation.status || 'Active',
            lastMessageTime: new Date(conversation.lastUpdated).getTime()
          }));
          setChats(transformedChats);
          // Set the first chat as active if none is selected
          if (!activeChat && transformedChats.length > 0) {
            setActiveChat(transformedChats[0]);
          }
        }
      } catch (error) {
        console.error('Error fetching chats:', error);
        setError('Failed to load conversations');
      } finally {
        setLoading(false);
      }
    };

    fetchChats();
  }, []);

  // Fetch messages when a chat is selected
  useEffect(() => {
    const fetchMessages = async () => {
      if (!activeChat) return;
      
      try {
        const response = await conversationAPI.getMessages(activeChat.id);
        if (response.data.success) {
          // Transform messages to match the expected format
          const transformedMessages = response.data.messages.map(msg => ({
            id: msg.id,
            sender: msg.sender === 'customer' ? 'other' : 'me',
            text: msg.message,
            time: msg.timestamp
          }));
          setMessages(transformedMessages);
        }
      } catch (error) {
        console.error('Error fetching messages:', error);
        setError('Failed to load messages');
      }
    };

    fetchMessages();
  }, [activeChat]);

  // Handle status change from ChatWindow
  const handleStatusChange = (chatId, newStatus) => {
    const updatedChats = chats.map(chat => {
      if (chat.id === chatId) {
        return {
          ...chat,
          status: newStatus
        };
      }
      return chat;
    });
    setChats(updatedChats);
    
    // Update activeChat if it's the one being changed
    if (activeChat && activeChat.id === chatId) {
      setActiveChat({
        ...activeChat,
        status: newStatus
      });
    }
  };

  // Simulate incoming client messages when AI mode is active
  useEffect(() => {
    if (aiMode && activeChat) {
      // Simulate a client message after 3 seconds
      const clientMessageTimer = setTimeout(() => {
        const clientMessages = [
          "Can you help me with my order?",
          "I need assistance with the product",
          "When will my delivery arrive?",
          "I have a question about pricing",
          "Is this item available in other colors?"
        ];
        
        const randomMessage = clientMessages[Math.floor(Math.random() * clientMessages.length)];
        const clientMessage = {
          id: messages.length + 1,
          sender: 'other',
          text: randomMessage,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        
        setMessages(prev => [...prev, clientMessage]);
        
        // Update chat's last message
        updateChatLastMessage(activeChat.id, randomMessage, clientMessage.time);
      }, 3000);

      return () => clearTimeout(clientMessageTimer);
    }
  }, [aiMode, activeChat, messages.length]);

  // Auto-reply to client messages when AI mode is active
  useEffect(() => {
    if (aiMode && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      
      // Only auto-reply to client messages (not our own)
      if (lastMessage.sender === 'other') {
        const aiReplyTimer = setTimeout(() => {
          const aiReplies = [
            "I understand your concern. Let me help you with that right away.",
            "Thank you for reaching out. I'm checking this for you now.",
            "I'll be happy to assist you with this request.",
            "Let me look into that for you. One moment please.",
            "I've received your message and I'm working on a solution."
          ];
          
          const randomReply = aiReplies[Math.floor(Math.random() * aiReplies.length)];
          const aiMessage = {
            id: messages.length + 1,
            sender: 'me',
            text: randomReply,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          };
          
          setMessages(prev => [...prev, aiMessage]);
          
          // Update chat's last message
          if (activeChat) {
            updateChatLastMessage(activeChat.id, randomReply, aiMessage.time);
          }
        }, 1500);

        return () => clearTimeout(aiReplyTimer);
      }
    }
  }, [messages, aiMode, activeChat]);

  // Update chat status when AI mode changes
  useEffect(() => {
    if (activeChat && aiMode) {
      handleStatusChange(activeChat.id, 'Assign to me');
    }
  }, [aiMode]);

  useEffect(() => {
    if (activeChat && (!messages || messages.length === 0)) {
      // Initialize with some messages for the active chat only if no messages exist
      setMessages([
        { id: 1, sender: 'other', text: 'Hey there! How can I help you today?', time: '10:00 AM' },
        { id: 2, sender: 'me', text: 'Hi! I need some assistance with my project.', time: '10:02 AM' },
      ]);
    }
  }, [activeChat, messages]);

  const updateChatLastMessage = (chatId, message, time) => {
    const updatedChats = chats.map(chat => {
      if (chat.id === chatId) {
        return {
          ...chat,
          lastMessage: message,
          time: time,
          lastMessageTime: new Date().getTime()
        };
      }
      return chat;
    });
    
    // Sort chats by lastMessageTime (most recent first)
    updatedChats.sort((a, b) => b.lastMessageTime - a.lastMessageTime);
    setChats(updatedChats);
  };

  const handleSendMessage = async (text) => {
    if (!text.trim() || !activeChat) return;
    
    try {
      // Send message to backend
      const response = await conversationAPI.sendMessage(activeChat.id, text);
      
      if (response.data.success) {
        // Add the message to the chat
        const newMessage = {
          id: response.data.message.id,
          sender: 'me',
          text: response.data.message.message,
          time: response.data.message.timestamp
        };
        setMessages([...messages, newMessage]);

        // Update the chat's last message and move it to top
        if (activeChat) {
          updateChatLastMessage(activeChat.id, text, newMessage.time);
        }
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setError('Failed to send message');
    }
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-white overflow-hidden">
      {/* Connection Status */}
      <div className="absolute top-0 left-0 right-0 z-10">
        <ConnectionStatus isConnected={true} platform="WhatsApp" />
      </div>
      
      {/* Sidebar */}
      <div className="w-80 border-r border-gray-200 flex flex-col h-full">
        {/* Header with Filters - Fixed */}
        <div className="flex-shrink-0">
          <ChatFilter
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
          />
        </div>

        {/* Chat List - Scrollable */}
        <div className="flex-1 overflow-hidden">
          <ChatList
            chats={chats}
            activeChat={activeChat}
            onChatSelect={setActiveChat}
            searchTerm={searchTerm}
            statusFilter={statusFilter}
          />
        </div>
      </div>

      {/* Chat Window */}
      <ChatWindow
        activeChat={activeChat ? { ...activeChat, status: chats.find(c => c.id === activeChat.id)?.status } : null}
        messages={messages}
        onSendMessage={handleSendMessage}
        aiMode={aiMode}
        onToggleAI={() => setAiMode(!aiMode)}
        onStatusChange={handleStatusChange}
        isDetailsOpen={isDetailsOpen}
        onToggleDetails={() => setIsDetailsOpen(!isDetailsOpen)}
      />

      {/* Customer Details Panel */}
      {activeChat && (
        <CustomerDetails
          customer={activeChat}
          isOpen={isDetailsOpen}
          onClose={() => setIsDetailsOpen(false)}
          messages={messages}
        />
      )}
    </div>
  );
}

export default WhatsappChat;