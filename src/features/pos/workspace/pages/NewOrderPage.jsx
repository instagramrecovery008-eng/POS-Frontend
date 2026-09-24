import React from 'react';
import TakeOrderWizard from '../components/TakeOrderWizard';
import PosWorkspace from './PosWorkspace';
import { useSettingsStore } from '../../../../store';

/**
 * New Order — page entry point.
 *
 * Barcode Scanner ON (Part 11 + Counter Scan): the dedicated Counter Scan
 * workspace REPLACES the normal category/item wizard entirely (spec §8/§13 —
 * never both interfaces at once), so this entry point renders PosWorkspace
 * (scan area + Counter Sale cart + payment) instead of TakeOrderWizard.
 *
 * Scanner OFF: renders the existing TakeOrderWizard in "page" mode so it
 * occupies the main AppShell content area (not a modal overlay). All
 * order-creation logic lives inside TakeOrderWizard.
 *
 * Visibility is controlled by the screen routing in AppShell — no modal
 * state manipulation is needed.
 */
export default function NewOrderPage() {
  const scanMode =
    useSettingsStore((s) => s.barcodeScannerAvailable) === true &&
    useSettingsStore((s) => s.settings?.barcodeScannerEnabled) === true;

  return (
    <div className="h-full w-full min-h-0">
      {scanMode ? <PosWorkspace /> : <TakeOrderWizard mode="page" />}
    </div>
  );
}
