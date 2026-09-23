import { motion } from 'framer-motion';

export default function Spinner() {
  return (
    <div className="flex justify-center py-24">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
        className="w-8 h-8 rounded-full"
        style={{
          background: 'conic-gradient(from 0deg, #F8A5B6 0%, #FDE8ED 60%, transparent 60%)',
          maskImage: 'radial-gradient(circle, transparent 58%, black 60%)',
          WebkitMaskImage: 'radial-gradient(circle, transparent 58%, black 60%)',
        }}
      />
    </div>
  );
}
