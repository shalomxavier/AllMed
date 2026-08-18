import { useMemo } from 'react';

interface PieChartData {
  label: string;
  value: number;
  color: string;
  total?: number;
}

interface PieChartProps {
  title: string;
  data: PieChartData[];
  emptyText?: string;
  onLabelClick?: (label: string) => void;
  departmentData?: PieChartData[];
  onDepartmentLabelClick?: (label: string) => void;
  className?: string;
}

export const PieChart: React.FC<PieChartProps> = ({
  title,
  data,
  emptyText = 'No data available',
  onLabelClick,
  departmentData,
  onDepartmentLabelClick,
  className,
}) => {
  const total = useMemo(() => data.reduce((sum, item) => sum + item.value, 0), [data]);
  const totalEmployees = useMemo(() => data.reduce((sum, item) => sum + (item.total || item.value), 0), [data]);
  const overallPercentage = useMemo(() => totalEmployees > 0 ? Math.round((total / totalEmployees) * 100) : 0, [total, totalEmployees]);

  const slices = useMemo(() => {
    if (total === 0) return [];

    let cumulativeAngle = 0;
    const radius = 80;
    const center = 100;

    return data.map((item) => {
      const angle = (item.value / total) * 360;
      const startAngle = cumulativeAngle;
      const endAngle = cumulativeAngle + angle;
      cumulativeAngle += angle;

      const startRadians = (startAngle * Math.PI) / 180;
      const endRadians = (endAngle * Math.PI) / 180;

      const x1 = center + radius * Math.cos(startRadians);
      const y1 = center + radius * Math.sin(startRadians);
      const x2 = center + radius * Math.cos(endRadians);
      const y2 = center + radius * Math.sin(endRadians);

      const largeArcFlag = angle > 180 ? 1 : 0;

      const path = [
        `M ${center} ${center}`,
        `L ${x1} ${y1}`,
        `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
        'Z',
      ].join(' ');

      return { ...item, path, percentage: total > 0 ? Math.round((item.value / total) * 100) : 0 };
    });
  }, [data, total]);

  return (
    <div className={`card p-5 bg-white border border-secondary-200 ${className || ''}`}>
      <h3 className="text-lg font-semibold text-secondary-900 mb-4">{title}</h3>

      {total === 0 ? (
        <div className="text-center py-8 text-secondary-500">{emptyText}</div>
      ) : (
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <div className="flex flex-col items-center gap-2">
            <svg viewBox="0 0 200 200" className="w-48 h-48 flex-shrink-0">
              {slices.map((slice, index) => (
                slice.percentage === 100 ? (
                  <circle
                    key={index}
                    cx="100"
                    cy="100"
                    r="80"
                    fill={slice.color}
                    stroke="white"
                    strokeWidth="2"
                  />
                ) : (
                  <path
                    key={index}
                    d={slice.path}
                    fill={slice.color}
                    stroke="white"
                    strokeWidth="2"
                  />
                )
              ))}
              <circle cx="100" cy="100" r="45" fill="white" />
              <text
                x="100"
                y="95"
                textAnchor="middle"
                className="text-sm fill-secondary-600 font-medium"
              >
                Total
              </text>
              <text
                x="100"
                y="115"
                textAnchor="middle"
                className={`text-lg font-bold ${overallPercentage <= 50 ? 'fill-red-600' : 'fill-secondary-900'}`}
              >
                {total}
              </text>
            </svg>
            <div className="text-center">
              <span className="text-sm text-secondary-600">out of </span>
              <span className={`text-sm font-semibold ${overallPercentage <= 50 ? 'text-red-600' : 'text-secondary-900'}`}>
                {totalEmployees}
              </span>
              <span className="text-sm text-secondary-600"> total employees</span>
            </div>
            <div className="text-center">
              <span className={`text-sm font-semibold ${overallPercentage <= 50 ? 'text-red-600' : 'text-secondary-900'}`}>
                {overallPercentage}%
              </span>
              <span className="text-sm text-secondary-600"> of total employees present</span>
            </div>
          </div>

          <div className="flex-1 w-full">
            <div className="grid grid-cols-2 gap-20">
              <div>
                <h4 className="text-sm font-semibold text-secondary-900 mb-2">By Designation</h4>
                <ul className="space-y-2">
                  {data.map((item, index) => (
                    <li key={index} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: item.color }}
                        />
                        <span
                          onClick={() => onLabelClick?.(item.label)}
                          className={`text-secondary-700 ${onLabelClick ? 'cursor-pointer hover:text-blue-600 hover:underline' : ''}`}
                        >
                          {item.label}
                        </span>
                      </div>
                      <span className={`font-medium ${item.total && (item.value / item.total) <= 0.5 ? 'text-red-600' : 'text-secondary-900'}`}>
                        {item.total ? `${item.value}/${item.total}` : item.value} ({item.total ? Math.round((item.value / item.total) * 100) : (total > 0 ? Math.round((item.value / total) * 100) : 0)}%)
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              
              {departmentData && departmentData.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-secondary-900 mb-2">By Department</h4>
                  <ul className="space-y-2">
                    {departmentData.map((item, index) => (
                      <li key={index} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: item.color }}
                          />
                          <span
                            onClick={() => onDepartmentLabelClick?.(item.label)}
                            className={`text-secondary-700 ${onDepartmentLabelClick ? 'cursor-pointer hover:text-blue-600 hover:underline' : ''}`}
                          >
                            {item.label}
                          </span>
                        </div>
                        <span className={`font-medium ${item.total && (item.value / item.total) <= 0.5 ? 'text-red-600' : 'text-secondary-900'}`}>
                          {item.total ? `${item.value}/${item.total}` : item.value} ({item.total ? Math.round((item.value / item.total) * 100) : (total > 0 ? Math.round((item.value / total) * 100) : 0)}%)
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
