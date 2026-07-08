interface PageHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({ action }) => {
  if (!action) return null;
  return (
    <div className="flex justify-end mb-4">
      <div>{action}</div>
    </div>
  );
};
