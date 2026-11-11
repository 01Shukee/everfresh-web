
"use client";

import { useEffect, useState } from "react";
import styles from "./EverfreshLocationMap.module.css";

const latitude = 6.0251051;
const longitude = 6.9261098;

const mapUrl =
  "https://www.openstreetmap.org/export/embed.html" +
  "?bbox=6.9161098%2C6.0151051%2C6.9361098%2C6.0351051" +
  "&layer=mapnik" +
  `&marker=${latitude}%2C${longitude}`;

const directionsUrl =
  `https://www.google.com/maps/dir/?api=1&destination=${latitude}%2C${longitude}`;

type Props = {
  compact?: boolean;
};

export function EverfreshLocationMap({ compact = false }: Props) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!expanded) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setExpanded(false);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [expanded]);

  return (
    <>
      <section
        className={`${styles.card} ${compact ? styles.compact : ""}`}
        aria-label="Everfresh location"
      >
        <div className={styles.heading}>
          <div>
            <span className={styles.eyebrow}>FIND US</span>
            <h2 className={styles.title}>Visit Everfresh</h2>
            <p className={styles.description}>
              Find our location and plan your visit.
            </p>
          </div>
        </div>

        <div className={styles.mapFrame}>
          <iframe
            title="Map showing Everfresh Fast Food Ltd"
            src={mapUrl}
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.expandButton}
            onClick={() => setExpanded(true)}
          >
            Expand map
          </button>

          <a
            className={styles.directionsButton}
            href={directionsUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Get directions
            <span aria-hidden="true">↗</span>
          </a>
        </div>
      </section>

      {expanded && (
        <div
          className={styles.overlay}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setExpanded(false);
            }
          }}
        >
          <section
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="everfresh-map-title"
          >
            <div className={styles.modalHeader}>
              <div>
                <span className={styles.eyebrow}>EVERFRESH LOCATION</span>
                <h2 id="everfresh-map-title" className={styles.title}>
                  Find your way to us
                </h2>
              </div>

              <button
                type="button"
                className={styles.closeButton}
                onClick={() => setExpanded(false)}
                aria-label="Close expanded map"
              >
                ×
              </button>
            </div>

            <div className={styles.largeMap}>
              <iframe
                title="Expanded map showing Everfresh Fast Food Ltd"
                src={mapUrl}
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
              />
            </div>

            <div className={styles.modalActions}>
              <a
                className={styles.directionsButton}
                href={directionsUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Get directions
                <span aria-hidden="true">↗</span>
              </a>

              <button
                type="button"
                className={styles.closeTextButton}
                onClick={() => setExpanded(false)}
              >
                Close map
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
