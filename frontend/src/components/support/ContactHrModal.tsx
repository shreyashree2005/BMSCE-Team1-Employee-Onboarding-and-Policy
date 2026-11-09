import { Clock, Copy, Mail, Phone } from "lucide-react";
import { hrContact } from "../../config/support";
import { useToast } from "../../context/ToastContext";
import { getInitials } from "../../utils/format";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { DemoBadge } from "../ui/DemoBadge";
import { Modal } from "../ui/Modal";

interface ContactHrModalProps {
  open: boolean;
  onClose: () => void;
}

export function ContactHrModal({ open, onClose }: ContactHrModalProps) {
  const { showToast } = useToast();
  const [firstName, lastName = ""] = hrContact.name.split(" ");

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(hrContact.email);
      showToast("HR email address copied to clipboard.");
    } catch {
      showToast(`Copy failed. The email address is ${hrContact.email}`, "info");
    }
  };

  const rows = [
    { icon: Mail, label: "Email", value: hrContact.email },
    { icon: Phone, label: "Phone", value: hrContact.phone },
    { icon: Clock, label: "Hours", value: hrContact.hours },
  ];

  return (
    <Modal
      open={open}
      title="Contact HR"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button onClick={copyEmail}>
            <Copy size={16} aria-hidden="true" />
            Copy email
          </Button>
        </>
      }
    >
      <div className="flex items-center gap-3">
        <Avatar initials={getInitials(firstName, lastName)} size="lg" tone="light" />
        <div>
          <p className="font-semibold text-navy-900">{hrContact.name}</p>
          <p className="text-sm text-slate-500">
            {hrContact.title} · {hrContact.team}
          </p>
        </div>
        <span className="ml-auto">
          <DemoBadge label="Demo contact" />
        </span>
      </div>
      <ul className="mt-5 divide-y divide-line rounded-md border border-line">
        {rows.map(({ icon: Icon, label, value }) => (
          <li key={label} className="flex items-center gap-3 px-4 py-3 text-sm">
            <Icon size={16} className="text-primary-500" aria-hidden="true" />
            <span className="w-14 text-slate-500">{label}</span>
            <span className="min-w-0 break-all font-medium text-navy-900">{value}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-sm text-slate-500">
        For urgent policy questions, try the Policy Assistant first. It answers from approved company documents.
      </p>
    </Modal>
  );
}
