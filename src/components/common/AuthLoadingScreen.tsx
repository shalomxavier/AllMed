import { RedSpinner } from './RedSpinner';

export const AuthLoadingScreen: React.FC = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-secondary-50">
      <div className="text-center">
        <RedSpinner size="lg" />
        <p className="text-secondary-600 font-medium mt-4">Loading...</p>
      </div>
    </div>
  );
};
