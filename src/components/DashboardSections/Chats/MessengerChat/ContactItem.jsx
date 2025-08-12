import React from 'react';

const ContactItem = ({ contact, isSelected, onClick }) => {
  // Determine lead score color
  const getLeadScoreColor = (score) => {
    if (score >= 80) return 'bg-green-100 text-green-800';
    if (score >= 60) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  // Determine status color
  const getStatusColor = (status) => {
    switch (status) {
      case 'open': return 'bg-blue-100 text-blue-800';
      case 'closed': return 'bg-green-100 text-green-800';
      case 'snoozed': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div
      className={`flex items-center p-3 cursor-pointer transition-all duration-200 hover:bg-gray-50 border-b border-gray-100 ${
        isSelected ? 'bg-blue-50 border-r-2 border-r-blue-500' : ''
      }`}
      onClick={() => onClick(contact)}
    >
      {/* Avatar with online status */}
      <div className="relative flex-shrink-0 mr-3">
        <img
          src={contact.avatar}
          alt={contact.name}
          className="w-12 h-12 rounded-full object-cover"
        />
        {contact.isOnline && (
          <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></div>
        )}
      </div>

      {/* Contact info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <h4 className="text-sm font-semibold text-gray-900 truncate">
            {contact.name}
          </h4>
          <div className="flex items-center space-x-1">
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${getLeadScoreColor(contact.leadScore)}`}>
              {contact.leadScore}
            </span>
            <span className="text-xs text-gray-500 flex-shrink-0">
              {contact.timestamp}
            </span>
          </div>
        </div>
        <p className="text-sm text-gray-600 truncate leading-tight mb-1">
          {contact.lastMessage}
        </p>
        <div className="flex items-center justify-between">
          <span className={`text-xs px-1.5 py-0.5 rounded-full ${getStatusColor(contact.status)}`}>
            {contact.status}
          </span>
          {contact.assignedTo && (
            <span className="text-xs text-gray-500 truncate">
              {contact.assignedTo}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default ContactItem;
