/** Palette Lagon (MyHafizz) */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Nunito', 'system-ui', 'sans-serif'] },
      colors: {
        lagon: { DEFAULT: '#00A3A8', dark: '#007C80', tint: '#D5F3F3', text: '#00666A', bg: '#EFF9F9' },
        ink: { DEFAULT: '#3C3C3C', soft: '#777777', faint: '#AFAFAF' },
        line: '#E5E5E5',
        gold: '#F2B530',
        danger: { DEFAULT: '#E5484D', dark: '#B5363A', tint: '#FDECEC' },
      },
      boxShadow: { press: '0 4px 0 0 var(--tw-shadow-color)' },
    },
  },
};
