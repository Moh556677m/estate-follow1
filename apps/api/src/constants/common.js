const NodeEnv = {
	Development: 'development',
	Production: 'production',
};

// Align with site-wide open upload policy (512MB). Host/proxy may still cap.
const BodyLimit = 1024 * 1024 * 512;

export { NodeEnv, BodyLimit };
