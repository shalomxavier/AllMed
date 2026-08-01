import { useState } from 'react';
import { Eye, EyeOff, Activity, AlertCircle, X, Mail, CheckCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface LoginFormData {
  email: string;
  password: string;
}

export const LoginPage: React.FC = () => {
  const { login, error, clearError, resetPassword } = useAuth();
  const [formData, setFormData] = useState<LoginFormData>({
    email: '',
    password: '',
  });
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [validationErrors, setValidationErrors] = useState<Partial<LoginFormData>>({});
  const [isForgotPasswordModalOpen, setIsForgotPasswordModalOpen] = useState<boolean>(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState<string>('');
  const [isResettingPassword, setIsResettingPassword] = useState<boolean>(false);
  const [resetPasswordSuccess, setResetPasswordSuccess] = useState<boolean>(false);
  const [resetPasswordError, setResetPasswordError] = useState<string>('');

  const validateForm = (): boolean => {
    const newErrors: Partial<LoginFormData> = {};

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    }

    setValidationErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    clearError();

    if (!validateForm()) return;

    setIsLoading(true);

    try {
      await login(formData.email, formData.password);
      // Successful login will trigger auth state change and redirect
    } catch {
      // Error is handled by AuthContext
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    // Clear errors when user types
    if (validationErrors[name as keyof LoginFormData]) {
      setValidationErrors((prev) => ({ ...prev, [name]: undefined }));
    }
    if (error) {
      clearError();
    }
  };

  const handleForgotPasswordClick = (): void => {
    setForgotPasswordEmail(formData.email);
    setResetPasswordSuccess(false);
    setResetPasswordError('');
    setIsForgotPasswordModalOpen(true);
  };

  const handleResetPassword = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    
    if (!forgotPasswordEmail.trim()) {
      setResetPasswordError('Email is required');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(forgotPasswordEmail)) {
      setResetPasswordError('Please enter a valid email');
      return;
    }

    setIsResettingPassword(true);
    setResetPasswordError('');

    try {
      await resetPassword(forgotPasswordEmail);
      setResetPasswordSuccess(true);
    } catch (err) {
      setResetPasswordError((err as Error).message || 'Failed to send reset email. Please try again.');
    } finally {
      setIsResettingPassword(false);
    }
  };

  const closeForgotPasswordModal = (): void => {
    setIsForgotPasswordModalOpen(false);
    setForgotPasswordEmail('');
    setResetPasswordSuccess(false);
    setResetPasswordError('');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-secondary-50 to-secondary-100 px-4">
      <div className="w-full max-w-md">
        {/* Logo and Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary-600 mb-4 shadow-lg">
            <Activity className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-secondary-900">ALLMED</h1>
          <p className="text-secondary-600 mt-1">Healthcare Management System</p>
        </div>

        {/* Login Card */}
        <div className="card p-8 shadow-xl">
          <h2 className="text-xl font-semibold text-secondary-900 text-center mb-6">
            Sign In
          </h2>

          {/* Auth Error Display */}
          {error && (
            <div className="mb-5 p-3 bg-primary-50 border border-primary-200 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-primary-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-primary-700">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email Field */}
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-secondary-700 mb-1.5"
              >
                Email Address
              </label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                placeholder="admin@allmed.com"
                className={`input ${validationErrors.email ? 'border-primary-500 focus:ring-primary-500' : ''}`}
                disabled={isLoading}
                autoComplete="email"
              />
              {validationErrors.email && (
                <p className="mt-1.5 text-sm text-primary-600">{validationErrors.email}</p>
              )}
            </div>

            {/* Password Field */}
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-secondary-700 mb-1.5"
              >
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  name="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  placeholder="Enter your password"
                  className={`input pr-10 ${validationErrors.password ? 'border-primary-500 focus:ring-primary-500' : ''}`}
                  disabled={isLoading}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary-400 hover:text-secondary-600 transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {validationErrors.password && (
                <p className="mt-1.5 text-sm text-primary-600">{validationErrors.password}</p>
              )}
            </div>

            {/* Remember Me & Forgot Password */}
            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-secondary-300 text-primary-600 focus:ring-primary-500"
                  disabled={isLoading}
                />
                <span className="text-secondary-600">Remember me</span>
              </label>
              <button
                type="button"
                onClick={handleForgotPasswordClick}
                className="text-primary-600 hover:text-primary-700 font-medium transition-colors"
              >
                Forgot password?
              </button>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full btn-primary py-2.5 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg
                    className="animate-spin h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Signing in...
                </span>
              ) : (
                'Sign In'
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-sm text-secondary-500 mt-6">
          ALLMED Healthcare Management System v1.0.0
        </p>
      </div>

      {/* Forgot Password Modal */}
      {isForgotPasswordModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={closeForgotPasswordModal}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-secondary-900">Reset Password</h3>
              <button
                onClick={closeForgotPasswordModal}
                className="p-1.5 rounded-lg text-secondary-500 hover:text-secondary-900 hover:bg-secondary-100 transition-colors"
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>

            {resetPasswordSuccess ? (
              <div className="text-center py-6">
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-8 h-8 text-green-600" />
                </div>
                <h4 className="text-lg font-medium text-secondary-900 mb-2">Check your email</h4>
                <p className="text-sm text-secondary-600 mb-4">
                  We've sent a password reset link to <strong>{forgotPasswordEmail}</strong>
                </p>
                <button
                  onClick={closeForgotPasswordModal}
                  className="w-full btn-primary py-2.5"
                >
                  Back to Sign In
                </button>
              </div>
            ) : (
              <>
                <p className="text-sm text-secondary-600 mb-4">
                  Enter your email address and we'll send you a link to reset your password.
                </p>

                {resetPasswordError && (
                  <div className="mb-4 p-3 bg-primary-50 border border-primary-200 rounded-lg flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-primary-600 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-primary-700">{resetPasswordError}</p>
                  </div>
                )}

                <form onSubmit={handleResetPassword} className="space-y-4">
                  <div>
                    <label
                      htmlFor="reset-email"
                      className="block text-sm font-medium text-secondary-700 mb-1.5"
                    >
                      Email Address
                    </label>
                    <div className="relative">
                      <input
                        type="email"
                        id="reset-email"
                        value={forgotPasswordEmail}
                        onChange={(e) => setForgotPasswordEmail(e.target.value)}
                        placeholder="Enter your email"
                        className="input pl-10"
                        disabled={isResettingPassword}
                        autoComplete="email"
                      />
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary-400" size={18} />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isResettingPassword}
                    className="w-full btn-primary py-2.5 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {isResettingPassword ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg
                          className="animate-spin h-5 w-5"
                          viewBox="0 0 24 24"
                          fill="none"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          />
                        </svg>
                        Sending...
                      </span>
                    ) : (
                      'Send Reset Link'
                    )}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
