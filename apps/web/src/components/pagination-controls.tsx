import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface PaginationControlsProps {
  total: number;
  limit: number;
  offset: number;
  onPageChange: (offset: number) => void;
  onLimitChange: (limit: number) => void;
}

export function PaginationControls({
  total,
  limit,
  offset,
  onPageChange,
  onLimitChange,
}: PaginationControlsProps) {
  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  const handlePrevious = () => {
    const newOffset = Math.max(0, offset - limit);
    onPageChange(newOffset);
  };

  const handleNext = () => {
    const maxOffset = Math.max(0, total - limit);
    const newOffset = Math.min(offset + limit, maxOffset);
    onPageChange(newOffset);
  };

  const handleFirst = () => {
    onPageChange(0);
  };

  const handleLast = () => {
    const lastPageOffset = Math.max(0, (totalPages - 1) * limit);
    onPageChange(lastPageOffset);
  };

  return (
    <div className="flex items-center justify-between px-2">
      <div className="flex items-center space-x-2">
        <p className="font-medium text-sm">Rows per page</p>
        <Select
          onValueChange={(value) => {
            onLimitChange(Number(value));
            onPageChange(0); // Reset to first page when changing limit
          }}
          value={limit.toString()}
        >
          <SelectTrigger className="h-8 w-[70px]">
            <SelectValue placeholder={limit} />
          </SelectTrigger>
          <SelectContent side="top">
            {[10, 20, 30, 50, 100].map((pageSize) => (
              <SelectItem key={pageSize} value={pageSize.toString()}>
                {pageSize}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center space-x-6 lg:space-x-8">
        <div className="flex w-[100px] items-center justify-center font-medium text-sm">
          Page {currentPage} of {totalPages}
        </div>
        <div className="flex items-center space-x-2">
          <Button
            className="h-8 w-8 p-0"
            disabled={currentPage === 1}
            onClick={handleFirst}
            variant="outline"
          >
            <span className="sr-only">Go to first page</span>
            <svg
              aria-label="Go to first page"
              fill="none"
              height="16"
              role="img"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
              width="16"
              xmlns="http://www.w3.org/2000/svg"
            >
              <polyline points="11 17 6 12 11 7" />
              <polyline points="18 17 13 12 18 7" />
            </svg>
          </Button>
          <Button
            className="h-8 w-8 p-0"
            disabled={currentPage === 1}
            onClick={handlePrevious}
            variant="outline"
          >
            <span className="sr-only">Go to previous page</span>
            <svg
              aria-label="Go to previous page"
              fill="none"
              height="16"
              role="img"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
              width="16"
              xmlns="http://www.w3.org/2000/svg"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </Button>
          <Button
            className="h-8 w-8 p-0"
            disabled={currentPage === totalPages}
            onClick={handleNext}
            variant="outline"
          >
            <span className="sr-only">Go to next page</span>
            <svg
              aria-label="Go to next page"
              fill="none"
              height="16"
              role="img"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
              width="16"
              xmlns="http://www.w3.org/2000/svg"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </Button>
          <Button
            className="h-8 w-8 p-0"
            disabled={currentPage === totalPages}
            onClick={handleLast}
            variant="outline"
          >
            <span className="sr-only">Go to last page</span>
            <svg
              aria-label="Go to last page"
              fill="none"
              height="16"
              role="img"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
              width="16"
              xmlns="http://www.w3.org/2000/svg"
            >
              <polyline points="13 17 18 12 13 7" />
              <polyline points="6 17 11 12 6 7" />
            </svg>
          </Button>
        </div>
      </div>
    </div>
  );
}
