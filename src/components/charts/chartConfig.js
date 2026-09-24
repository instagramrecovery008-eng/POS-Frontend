/**
 * Shared Chart.js registration.
 *
 * Import this file once (e.g. in ReportsPage.jsx) before any Chart.js chart
 * renders.  Chart.js v4 requires explicit registration of every scale,
 * element, controller and plugin used by the application.
 *
 * Chart types currently in use:
 *   Bar   → CategoryScale, LinearScale, BarElement, BarController
 *   Doughnut → ArcElement, DoughnutController
 *   (Line/Point would go here if ever added)
 */

import {
  Chart,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  BarController,
  LineController,
  DoughnutController,
  Tooltip,
  Legend,
  Title,
  Filler,
} from 'chart.js';

Chart.register(
  // Scales
  CategoryScale,
  LinearScale,
  // Elements
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  // Controllers
  BarController,
  LineController,
  DoughnutController,
  // Plugins
  Tooltip,
  Legend,
  Title,
  Filler,
);

export default Chart;
