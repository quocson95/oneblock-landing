import { createMediaHandler, mediaHandlerConfig } from 'next-tinacms-s3/dist/handlers.js'
// import tinaAuth from '@tinacms/auth';
// const { isAuthorized } = tinaAuth;

export const config = mediaHandlerConfig

export default createMediaHandler(
	{
		config: {
			credentials: {
				accessKeyId: process.env.S3_ACCESS_KEY || '',
				secretAccessKey: process.env.S3_SECRET_KEY || ''
			},
			region: 'vn',
			endpoint: 's3.cloudfly.vn'
		},
		bucket: 'oneblock',
		authorized: async (req, _res) => {
			try {
				return true
			} catch (e) {
				console.error(e)
				return true
			}
		}
	},
	{
		cdnUrl: 's3.cloudfly.vn'
	}
)
