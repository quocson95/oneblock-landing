interface SiteConfig {
	site: string
	author: string
	title: string
	description: string
	lang: string
	ogLocale: string
	shareMessage: string
	paginationSize: number
}

export const siteConfig: SiteConfig = {
	site: 'https://oneblock.vn/', // Write here your website url
	author: 'Oneblock Group', // Site author
	title: 'Oneblock', // Site title.
	description: 'Trang chính thức của Oneblock, chia sẻ thông tin trading', // Description to display in the meta tags
	lang: 'vi-VN',
	ogLocale: 'vi_VN',
	shareMessage: 'Chia sẻ bài này', // Message to share a post on social media
	paginationSize: 6 // Number of posts per page
}
