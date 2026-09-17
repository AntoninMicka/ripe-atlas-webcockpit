const STATUS = new Map([
  [1, { label: "Never connected", tone: "warning" }],
  [2, { label: "Connected", tone: "good" }],
  [3, { label: "Disconnected", tone: "danger" }],
  [4, { label: "Abandoned", tone: "muted" }]
]);

function statusTone(label) {
  switch (String(label).toLowerCase()) {
    case "connected": return "good";
    case "never connected": return "warning";
    case "disconnected": return "danger";
    default: return "muted";
  }
}

function reported(value) {
  return value === null || value === undefined || value === "" ? "Not reported" : String(value);
}

export function formatAsn(value) {
  return Number.isInteger(value) && value > 0 ? `AS${value}` : "Not reported";
}

export function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "Not reported";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days > 0) return `${days.toLocaleString("en-US")}d ${hours}h`;
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

export function formatTimestamp(unixSeconds) {
  if (!Number.isFinite(unixSeconds) || unixSeconds <= 0) return "Not reported";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short"
  }).format(new Date(unixSeconds * 1000));
}

export function normalizeProbe(probe) {
  const statusId = probe?.status?.id ?? probe?.status;
  const statusLabel = probe?.status?.name ?? probe?.status_name ?? STATUS.get(statusId)?.label;
  const status = {
    label: reported(statusLabel),
    tone: statusLabel ? statusTone(statusLabel) : (STATUS.get(statusId)?.tone ?? "muted")
  };
  const tags = Array.isArray(probe?.tags)
    ? probe.tags.map((tag) => tag?.slug ?? tag?.name).filter(Boolean).sort()
    : [];

  return {
    id: reported(probe?.id),
    status,
    country: reported(probe?.country_code),
    description: reported(probe?.description),
    isPublic: probe?.is_public === true,
    isAnchor: probe?.is_anchor === true,
    ipv4: {
      address: reported(probe?.address_v4),
      prefix: reported(probe?.prefix_v4),
      asn: formatAsn(probe?.asn_v4)
    },
    ipv6: {
      address: reported(probe?.address_v6),
      prefix: reported(probe?.prefix_v6),
      asn: formatAsn(probe?.asn_v6)
    },
    firmware: reported(probe?.firmware_version),
    firstConnected: formatTimestamp(probe?.first_connected),
    lastConnected: formatTimestamp(probe?.last_connected),
    uptime: formatDuration(probe?.total_uptime),
    tags
  };
}
