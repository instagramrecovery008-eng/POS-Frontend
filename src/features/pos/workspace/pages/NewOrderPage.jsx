import React from 'react';
import TakeOrderWizard from '../components/TakeOrderWizard';
import PosWorkspace from './PosWorkspace';
import { useSettingsStore, useUiStore } from '../../../../store';

/**
 * New Order / POS Ordering — page entry point.
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
 * Table hand-off (Floors & Tables → Open Table / Add Items): the tapped table
 * (or the order being extended) is ordered on THIS screen — the wizard is
 * rendered in page mode so the menu for that table appears inline, replacing
 * the previous separate modal/card overlay. The Counter Scan workspace has no
 * floor/table workflow, so a pending hand-off always takes precedence over the
 * scan mode (otherwise the handed-over table would be silently dropped).
 *
 * Visibility is controlled by the screen routing in AppShell — no modal
 * state manipulation is needed.
 */
export default function NewOrderPage() {
  const scanMode =
    useSettingsStore((s) => s.barcodeScannerAvailable) === true &&
    useSettingsStore((s) => s.settings?.barcodeScannerEnabled) === true;

  // A table being opened (pendingTable) or an existing order being extended
  // (activeOrderTakingId) is only orderable through the wizard.
  const hasOrderHandoff = useUiStore((s) => !!s.pendingTable || !!s.activeOrderTakingId);

  return (
    <div className="h-full w-full min-h-0">
      {scanMode && !hasOrderHandoff ? <PosWorkspace /> : <TakeOrderWizard mode="page" />}
    </div>
  );
}
