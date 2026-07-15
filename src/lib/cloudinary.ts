import cloudinary from 'cloudinary'

// Server-side upload
cloudinary.v2.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

export async function uploadImage(file: string): Promise<string> {
  // TODO: Implement server-side upload
  // const result = await cloudinary.v2.uploader.upload(file, {
  //   folder: 'asehanta/listings',
  // })
  // return result.secure_url
  throw new Error('Not implemented')
}

export function getCloudinaryConfig() {
  return {
    cloudName: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
  }
}
