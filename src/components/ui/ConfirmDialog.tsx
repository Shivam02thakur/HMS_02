import { AlertTriangle } from 'lucide-react';
import { Modal } from './Modal';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
}

export function ConfirmDialog({
  isOpen, onClose, onConfirm, title, message,
  confirmText = 'Confirm', cancelText = 'Cancel', isDanger = false
}: ConfirmDialogProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <div className="flex flex-col items-center text-center">
        <div className={`flex h-12 w-12 items-center justify-center rounded-full ${isDanger ? 'bg-red-100' : 'bg-yellow-100'}`}>
          <AlertTriangle className={`h-6 w-6 ${isDanger ? 'text-red-600' : 'text-yellow-600'}`} />
        </div>
        <p className="mt-4 text-sm text-gray-600">{message}</p>
        <div className="mt-6 flex gap-3 w-full">
          <button onClick={onClose} className="btn-secondary flex-1">{cancelText}</button>
          <button
            onClick={() => { onConfirm(); onClose(); }}
            className={isDanger ? 'btn-danger flex-1' : 'btn-primary flex-1'}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </Modal>
  );
}
