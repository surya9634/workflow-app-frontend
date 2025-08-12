import React from 'react';
import { AlertCircle } from 'lucide-react';

const ConnectionStatus = ({ isConnected, platform }) => {
  if (isConnected) {
    return null;
  }

  return (
    <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
      <div className="flex items-center">
        <div className="flex-shrink-0">
          <AlertCircle className="h-5 w-5 text-yellow-400" />
        </div>
        <div className="ml-3">
          <p className="text-sm text-yellow-700">
            <span className="font-medium">Not connected:</span> Please connect your {platform} account to start using this feature.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ConnectionStatus;