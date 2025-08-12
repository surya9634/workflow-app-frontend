import React, { useState, useEffect } from 'react';
import { Zap, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { aiAPI } from '../../../../lib/api';

const QuickReplies = ({ onSelectReply, isVisible, onToggle, lastMessage }) => {
  const [selectedReply, setSelectedReply] = useState(null);
  const [aiReplies, setAiReplies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const generateAIReplies = async (message) => {
    if (!message) return [];
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await aiAPI.generateContent({
        prompt: message,
        type: 'quick-replies'
      });
      
      // Parse AI response into quick replies
      // This is a simple parser - in a real implementation you'd want to improve this
      const aiContent = response.data.content;
      
      // Split by lines and filter out empty lines
      const lines = aiContent
        .split('\n')
        .filter(line => line.trim() !== '')
        .slice(0, 5); // Limit to 5 replies
      
      // Create reply objects
      const replies = lines.map((line, index) => {
        // Remove numbering if present
        const cleanLine = line.replace(/^\d+\.\s*/, '').trim();
        return {
          id: `ai-${index}`,
          title: `Suggestion ${index + 1}`,
          message: cleanLine
        };
      });
      
      setAiReplies(replies);
      return replies;
    } catch (err) {
      console.error('AI Quick Replies error:', err);
      setError('Failed to generate AI suggestions');
      
      // Generate fallback replies based on message content
      let fallbackReplies = [];
      
      if (message.toLowerCase().includes('interested') || message.toLowerCase().includes('premium')) {
        fallbackReplies = [
          {
            id: 'fr1',
            title: 'Premium Package Details',
            message: 'Our premium package includes all features with priority support. Would you like me to send you a detailed comparison?'
          },
          {
            id: 'fr2',
            title: 'Schedule Demo',
            message: 'I\'d be happy to schedule a personalized demo for you! What time works best for you this week?'
          },
          {
            id: 'fr3',
            title: 'Special Offer',
            message: 'Great news! We\'re currently offering 20% off annual subscriptions. Would you like to learn more?'
          }
        ];
      } else if (message.toLowerCase().includes('demo') || message.toLowerCase().includes('discuss')) {
        fallbackReplies = [
          {
            id: 'fr4',
            title: 'Demo Follow-up',
            message: 'Thanks for attending the demo! I\'d love to hear your thoughts and answer any questions you might have.'
          },
          {
            id: 'fr5',
            title: 'Next Steps',
            message: 'Based on what we discussed, I can set up a trial account for your team right away. Would that work for you?'
          },
          {
            id: 'fr6',
            title: 'Team Introduction',
            message: 'I can connect you with our implementation specialist who can help with onboarding your team.'
          }
        ];
      } else if (message.toLowerCase().includes('pricing') || message.toLowerCase().includes('price')) {
        fallbackReplies = [
          {
            id: 'fr7',
            title: 'Pricing Options',
            message: 'We offer flexible pricing plans starting at $49/month. Would you like me to send you a detailed pricing sheet?'
          },
          {
            id: 'fr8',
            title: 'Custom Quote',
            message: 'I can prepare a custom quote based on your specific needs. How many team members would be using the platform?'
          },
          {
            id: 'fr9',
            title: 'Free Trial',
            message: 'You can try our platform free for 14 days with full access to all features. Would you like me to set that up?'
          }
        ];
      } else {
        fallbackReplies = [
          {
            id: 'fr10',
            title: 'Learn More',
            message: 'I\'d be happy to tell you more about how our platform can help your business. What specific challenges are you looking to solve?'
          },
          {
            id: 'fr11',
            title: 'Case Studies',
            message: 'We\'ve helped companies like yours achieve great results. Would you like to see some case studies from similar businesses?'
          },
          {
            id: 'fr12',
            title: 'Get Started',
            message: 'Let\'s get started with a quick assessment of your needs. What are your top priorities for this year?'
          }
        ];
      }
      
      setAiReplies(fallbackReplies);
      return fallbackReplies;
    } finally {
      setLoading(false);
    }
  };

  const handleReplySelect = (reply) => {
    setSelectedReply(reply.id);
    onSelectReply(reply.message);
    // Reset selection after a brief moment
    setTimeout(() => setSelectedReply(null), 300);
  };

  // Generate AI replies when lastMessage changes
  useEffect(() => {
    if (isVisible && lastMessage) {
      generateAIReplies(lastMessage);
    }
  }, [isVisible, lastMessage]);

  if (!isVisible) {
    return (
      <button
        onClick={onToggle}
        className="flex items-center gap-2 px-3 py-2 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
      >
        <Zap size={16} />
        Quick Replies
        <ChevronUp size={14} />
      </button>
    );
  }

  return (
    <div>
      {loading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
          <span className="ml-2 text-sm text-gray-600">Generating suggestions...</span>
        </div>
      ) : error ? (
        <div className="text-center py-4">
          <p className="text-sm text-red-600">{error}</p>
          <button
            onClick={() => generateAIReplies(lastMessage)}
            className="mt-2 text-sm text-blue-600 hover:text-blue-700"
          >
            Try again
          </button>
        </div>
      ) : aiReplies.length > 0 ? (
        <>
          <div className="grid grid-cols-1 gap-2 mb-4">
            {aiReplies.slice(0, 3).map((reply) => (
              <button
                key={reply.id}
                onClick={() => handleReplySelect(reply)}
                className={`p-3 text-left text-sm rounded-lg border transition-all ${
                  selectedReply === reply.id
                    ? 'bg-blue-100 border-blue-300 text-blue-700'
                    : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-blue-50 hover:border-blue-200'
                }`}
              >
                <div className="font-medium mb-1">{reply.title}</div>
                <div className="text-xs text-gray-500 line-clamp-2">
                  {reply.message}
                </div>
              </button>
            ))}
          </div>
          
          <div className="grid grid-cols-2 gap-2">
            {aiReplies.slice(3).map((reply) => (
              <button
                key={reply.id}
                onClick={() => handleReplySelect(reply)}
                className={`p-2 text-left text-sm rounded-lg border transition-all ${
                  selectedReply === reply.id
                    ? 'bg-blue-100 border-blue-300 text-blue-700'
                    : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-blue-50 hover:border-blue-200'
                }`}
              >
                <div className="font-medium mb-1">{reply.title}</div>
                <div className="text-xs text-gray-500 line-clamp-1">
                  {reply.message}
                </div>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="text-center py-4">
          <p className="text-sm text-gray-600">No suggestions available</p>
          {lastMessage && (
            <button
              onClick={() => generateAIReplies(lastMessage)}
              className="mt-2 text-sm text-blue-600 hover:text-blue-700"
            >
              Generate suggestions
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default QuickReplies;