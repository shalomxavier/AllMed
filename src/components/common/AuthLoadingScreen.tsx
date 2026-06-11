import { Activity } from 'lucide-react';

export const AuthLoadingScreen: React.FC = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-secondary-50">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary-600 mb-4 shadow-lg animate-pulse">
          <Activity className="w-8 h-8 text-white" />
        </div>
        <p className="text-secondary-600 font-medium">Loading...</p>
      </div>
    </div>
  );
};
