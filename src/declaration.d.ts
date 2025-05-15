declare module 'chartjs-plugin-datalabels' {
    import { Chart } from 'chart.js';
  
    export interface DataLabelsOptions {
      color?: string;
      font?: { weight?: string; size?: number };
      formatter?: (value: number, context: { chart: Chart; dataIndex: number }) => string;
      textShadowBlur?: number;
      textShadowColor?: string;
      rotation?: (context: { chart: Chart; dataIndex: number }) => number;
    }
  
    const value: any;
    export default value;
  }
  
  import 'chart.js';
  
  declare module 'chart.js' {
    interface PluginOptionsByType<TType extends ChartType> {
      datalabels?: DataLabelsOptions;
    }
  }
  declare module 'canvas-confetti';