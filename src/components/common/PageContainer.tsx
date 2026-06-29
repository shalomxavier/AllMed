import type { LayoutProps } from '@/types/index';

interface PageContainerProps extends LayoutProps {
  className?: string;
}

export const PageContainer: React.FC<PageContainerProps> = ({ children, className = '' }) => {
  return (
    <div className={`w-full max-w-7xl mx-auto ${className}`}>
      {children}
    </div>
  );
};
