"use client";

import { useState } from "react";

/** A password field with a show/hide toggle, for the Settings → Users forms where a Super Admin types a plaintext password and has no way to double-check what they typed before saving. */
export default function PasswordInput({
  name,
  required,
  minLength,
  className,
  placeholder,
}: {
  name: string;
  required?: boolean;
  minLength?: number;
  className?: string;
  placeholder?: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        name={name}
        type={visible ? "text" : "password"}
        required={required}
        minLength={minLength}
        placeholder={placeholder}
        className={`${className ?? "input"} pr-14`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute inset-y-0 right-0 px-3 text-xs font-medium text-slate-400 hover:text-indigo-600"
        tabIndex={-1}
      >
        {visible ? "Hide" : "Show"}
      </button>
    </div>
  );
}
