import { NextResponse } from 'next/server'
import { notifyAdmins, notifyUser } from '@/lib/notify'

const TEST_EMAIL = 'asehanta@gmail.com'
const TEST_EMAIL_2 = 'derrickom005@gmail.com'

export async function GET() {
  const results: Record<string, { status: 'sent' | 'error'; error?: string }> = {}

  // Admin notifications
  const adminEvents = [
    { key: 'new_user_registration', fn: () => notifyAdmins('New User Registration', 'New User Signed Up', { Name: 'Test User', Username: 'testuser', Email: TEST_EMAIL, Phone: '0712345678', Role: 'hunter' }) },
    { key: 'new_house_request', fn: () => notifyAdmins('New House Request', 'House Request Submitted', { Name: 'John Doe', Email: TEST_EMAIL, Phone: '0712345678', Location: 'Nairobi', MinRent: '20000', MaxRent: '50000' }) },
    { key: 'new_contact_submission', fn: () => notifyAdmins('New Contact Submission', 'Contact Form', { Name: 'Jane Smith', Email: TEST_EMAIL, Phone: '0722345678', Message: 'Test message' }) },
    { key: 'new_listing_uploaded', fn: () => notifyAdmins('New Listing Uploaded', 'New Listing', { Title: 'Test House', Location: 'Kilimani', Price: 'KES 35,000', Uploader: 'testuser' }) },
    { key: 'new_house_booking', fn: () => notifyAdmins('New House Booking', 'Booking', { Listing: 'Test House', Amount: 'KES 5,000', Customer: 'Test User' }) },
    { key: 'stk_push_initiated', fn: () => notifyAdmins('STK Push Initiated', 'M-Pesa Payment Request', { User: TEST_EMAIL, Phone: '0712345678', Listing: 'Test House', Amount: 'KES 5,000', 'Checkout ID': 'ws_CO_12345' }) },
    { key: 'payment_successful', fn: () => notifyAdmins('Payment Successful', 'M-Pesa Payment Received', { Phone: '0712345678', Amount: 'KES 5,000', Receipt: 'TEST123456', 'Checkout ID': 'ws_CO_12345' }) },
    { key: 'payment_failed', fn: () => notifyAdmins('Payment Failed', 'M-Pesa Payment Failed', { 'Checkout ID': 'ws_CO_12345', 'Result Code': '1', Description: 'Insufficient funds' }) },
    { key: 'manual_payment_verified', fn: () => notifyAdmins('Manual Payment Verified', 'Manual M-Pesa Payment', { User: TEST_EMAIL, Phone: '0712345678', Listing: 'Test House', Amount: 'KES 5,000', Receipt: 'TEST123456' }) },
    { key: 'manual_payment_submitted', fn: () => notifyAdmins('Manual Payment Submitted for Verification', 'M-Pesa Payment Pending Daraja Check', { User: TEST_EMAIL, Phone: '0712345678', Listing: 'Test House', Amount: 'KES 5,000', Receipt: 'TEST123456' }) },
    { key: 'manual_payment_failed', fn: () => notifyAdmins('Manual Payment Verification Failed', 'Amount mismatch detected', { Receipt: 'TEST123456', 'Daraja Amount': 'KES 4,000', 'Expected': 'KES 5,000' }) },
    { key: 'payment_verified_by_daraja', fn: () => notifyAdmins('Manual Payment Verified by Daraja', 'M-Pesa Transaction Confirmed', { Receipt: 'TEST123456', Amount: 'KES 5,000', Receiver: 'AseHanta Ltd' }) },
    { key: 'b2c_refund_initiated', fn: () => notifyAdmins('B2C Refund Initiated', 'Money transfer to customer', { Phone: '0712345678', Amount: 'KES 4,250', 'Conversation ID': 'conv_123', Response: 'Success' }) },
    { key: 'b2c_refund_success', fn: () => notifyAdmins('B2C Refund Successful', 'Money sent to customer', { Receipt: 'TEST123456', Amount: 'KES 4,250', Receiver: 'Test Customer', 'Conversation ID': 'conv_123' }) },
    { key: 'b2c_refund_failed', fn: () => notifyAdmins('B2C Refund Failed', 'Failed to send money to customer', { 'Conversation ID': 'conv_123', 'Result Code': '1', Description: 'Timeout' }) },
    { key: 'wifi_booking', fn: () => notifyAdmins('WIFI Booking', 'WiFi Request', { Package: 'Home 20Mbps', Speed: '20Mbps', Price: 'KES 3,500', OriginalPrice: 'KES 4,000', Discount: '12%', Provider: 'Jambonet', Name: 'Test User', Phone: '0712345678', Area: 'Nairobi' }) },
    { key: 'house_request_fulfilled', fn: () => notifyAdmins('House Request Fulfilled', 'Request Fulfilled', { Name: 'Test User', Email: TEST_EMAIL, Phone: '0712345678', Location: 'Nairobi' }) },
    { key: 'house_request_contacted', fn: () => notifyAdmins('House Request Contacted', 'Request Contacted', { Name: 'Test User', Email: TEST_EMAIL, Phone: '0712345678' }) },
  ]

  // Customer notifications (notifyUser)
  const customerEvents = [
    { key: 'house_request_fulfilled_customer', fn: () => notifyUser(TEST_EMAIL, 'House Request Fulfilled', 'Your House Request', { Status: 'Fulfilled', Details: 'We found a match for your request!', Contact: 'Agent will call you' }) },
    { key: 'house_request_contacted_customer', fn: () => notifyUser(TEST_EMAIL, 'House Request Contacted', 'Your House Request', { Status: 'Contacted', Details: 'Our team has contacted you regarding your request' }) },
    { key: 'listing_deleted_customer', fn: () => notifyUser(TEST_EMAIL, 'Listing Deleted', 'Your Listing Was Removed', { Title: 'Test House', Reason: 'Removed by admin' }) },
    { key: 'listing_booked_customer', fn: () => notifyUser(TEST_EMAIL, 'Listing Booked', 'Your Listing Has Been Booked', { Title: 'Test House', Date: new Date().toLocaleDateString(), CustomerPhone: '0712345678' }) },
    { key: 'listing_taken_customer', fn: () => notifyUser(TEST_EMAIL, 'Listing Taken', 'Your Listing Is No Longer Available', { Title: 'Test House' }) },
    { key: 'listing_approved_customer', fn: () => notifyUser(TEST_EMAIL, 'Listing Approved', 'Your Listing Is Live', { Title: 'Test House', Location: 'Nairobi', URL: 'https://asehanta.com/listings/test' }) },
    { key: 'booking_completed_customer', fn: () => notifyUser(TEST_EMAIL, 'Booking Completed', 'Viewing Completed', { Title: 'Test House', Status: 'Completed' }) },
    { key: 'refund_processed_customer', fn: () => notifyUser(TEST_EMAIL, 'Refund Processed', 'Your Refund', { Title: 'Test House', Amount: 'KES 4,250' }) },
    { key: 'account_deleted_customer', fn: () => notifyUser(TEST_EMAIL, 'Account Deleted', 'Your Account Was Deleted', { Name: 'Test User' }) },
    { key: 'role_changed_customer', fn: () => notifyUser(TEST_EMAIL, 'Role Changed', 'Your Role Was Updated', { OldRole: 'hunter', NewRole: 'lister' }) },
    { key: 'listing_approved_admin_upload_customer', fn: () => notifyUser(TEST_EMAIL, 'Listing Approved', 'Your Listing Is Live', { Title: 'Test House', Location: 'Nairobi', URL: 'https://asehanta.com/listings/test' }) },
  ]

  // Fire admin events
  for (const { key, fn } of adminEvents) {
    try {
      await fn()
      results[key] = { status: 'sent' }
    } catch (err) {
      results[key] = { status: 'error', error: String(err) }
    }
  }

  // Fire customer events
  for (const { key, fn } of customerEvents) {
    try {
      await fn()
      results[key] = { status: 'sent' }
    } catch (err) {
      results[key] = { status: 'error', error: String(err) }
    }
  }

  return NextResponse.json({ results, message: `Fired ${Object.keys(results).filter(k => results[k].status === 'sent').length}/${Object.keys(results).length} emails` })
}