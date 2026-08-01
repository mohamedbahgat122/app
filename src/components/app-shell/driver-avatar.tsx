"use client";

import Image from "next/image";
import { useState } from "react";

type DriverAvatarProps = {
  imageUrl: string | null;
  name: string;
};

export function DriverAvatar({ imageUrl, name }: DriverAvatarProps) {
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const initials = getInitials(name);
  const shouldShowImage = imageUrl && failedImageUrl !== imageUrl;

  return (
    <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-soft text-sm font-bold text-primary">
      {shouldShowImage ? (
        <Image
          src={imageUrl}
          alt={name}
          width={44}
          height={44}
          className="size-full object-cover"
          onError={() => setFailedImageUrl(imageUrl)}
        />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  );
}

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}
