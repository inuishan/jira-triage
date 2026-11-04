import { useEffect, useRef } from 'react';

export default function useHotkeys(map, enabled = true) {
  const mapRef = useRef(map);

  useEffect(() => {
    mapRef.current = map;
  }, [map]);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e) => {
      // Skip repeat events
      if (e.repeat) return;

      // Normalize key
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

      // Check if focus is in input/textarea/select/contenteditable
      const activeElement = document.activeElement;
      const isInFormControl =
        activeElement &&
        (activeElement.tagName === 'INPUT' ||
          activeElement.tagName === 'TEXTAREA' ||
          activeElement.tagName === 'SELECT' ||
          activeElement.contentEditable === 'true');

      // Allow Escape even in form controls
      if (isInFormControl && key !== 'Escape') {
        return;
      }

      const handler = mapRef.current[key] || mapRef.current[`mod+${key}`];

      if (!handler) return;

      // Check for mod+z special case
      if (`mod+${key}` in mapRef.current) {
        const isModPressed = e.ctrlKey || e.metaKey;
        if (!isModPressed) return;
      } else {
        // For regular keys, ignore if alt/ctrl/meta modifiers are pressed
        if (e.altKey || e.ctrlKey || e.metaKey) return;
      }

      e.preventDefault();
      handler(e);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled]);
}
