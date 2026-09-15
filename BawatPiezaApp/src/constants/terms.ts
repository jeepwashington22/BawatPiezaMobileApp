/**
 * Terms & Conditions / Privacy Policy presented before an account is created.
 *
 * NOTE: This wording is a product-ready template, not legal advice. Have it
 * reviewed by counsel before relying on it in production.
 *
 * Bump TERMS_VERSION whenever the text below changes: the accepted version is
 * stored on the user (user_metadata.terms_version) so you can tell which
 * revision each account agreed to.
 */
export const TERMS_VERSION = '1.0';
export const TERMS_UPDATED = 'September 15, 2026';
export const TERMS_TITLE = 'Terms & Conditions';
export const TERMS_SUBTITLE = 'BawatPieza Energy Monitoring Platform';
export const TERMS_COMPANY = 'BawatPieza Technologies';

export type TermsSection = {
  heading: string;
  body: string[];
};

export const TERMS_INTRO =
  'Welcome to BawatPieza. These Terms & Conditions ("Terms") govern your access to and use of the BawatPieza mobile application, dashboard, and related services (the "Service"). Please read them carefully before creating an account. By registering an account - whether by email and password, by Google Sign-In, or by any other sign-in method we support - you confirm that you have read, understood, and agreed to be bound by these Terms and by our Privacy Policy.';

export const TERMS_SECTIONS: TermsSection[] = [
  {
    heading: '1. Eligibility and Account Registration',
    body: [
      'You must be at least eighteen (18) years old, or the age of legal majority in your jurisdiction, and capable of entering into a binding agreement to use the Service. If you register on behalf of a company, cooperative, or other organization, you represent that you are authorized to bind that organization to these Terms.',
      'You agree to provide accurate, current, and complete information when you register and to keep it up to date. Accounts created through a third-party identity provider (for example Google) rely on the identity information that provider releases to us. You are responsible for all activity that occurs under your account.',
    ],
  },
  {
    heading: '2. Account Security',
    body: [
      'You are responsible for keeping your login credentials confidential and for restricting access to your devices. Notify us immediately at support@bawatpieza.com if you suspect any unauthorized use of your account or any other breach of security.',
      'We may suspend or terminate accounts that we reasonably believe have been compromised, shared, or used in violation of these Terms.',
    ],
  },
  {
    heading: '3. About the Service',
    body: [
      'BawatPieza provides hardware and software for harvesting kinetic and piezoelectric energy and for monitoring the resulting power, battery, and device telemetry. Readings, dashboards, and analytics are provided for informational and operational planning purposes only.',
      'The Service is not certified for life-support, medical, aviation, or other safety-critical applications. You remain responsible for engineering, electrical, and safety decisions at your installation site, and for complying with all applicable electrical codes and local regulations.',
    ],
  },
  {
    heading: '4. Acceptable Use',
    body: [
      'You agree not to: (a) reverse engineer, decompile, or attempt to extract the source code of the Service; (b) access the Service using automated scripts in a way that degrades performance for other users; (c) upload malicious code, or content that infringes the rights of others; (d) resell, sublicense, or commercially exploit the Service without our written consent; or (e) use the Service in violation of any applicable law.',
      'You retain ownership of the data and content you upload. You grant us a limited licence to host, process, and transmit that content solely to operate, secure, and improve the Service.',
    ],
  },
  {
    heading: '5. Data Privacy and Consent to Processing',
    body: [
      'We collect and process the personal data you provide - such as your name, email address, company, profile photo, and, where applicable, account and device telemetry - in order to create and secure your account, deliver the Service, provide support, and send service notifications such as welcome and verification emails.',
      'We process personal data in accordance with the Philippine Data Privacy Act of 2012 (Republic Act No. 10173) and its Implementing Rules and Regulations, and with other data protection laws that apply to you. We do not sell your personal data. We share it only with service providers that help us operate the Service (for example our hosting, authentication, and email delivery providers), and only to the extent necessary.',
      'You may exercise your rights to be informed, to object, to access, to rectify, to erase or block, to damages, and to data portability by contacting our Data Protection Officer at privacy@bawatpieza.com. We retain personal data for as long as your account remains active and for the period required by applicable law thereafter. You may request deletion of your account and associated personal data at any time.',
      'By ticking the agreement checkbox you give your consent to the collection and processing of your personal data as described above.',
    ],
  },
  {
    heading: '6. Electronic Communications',
    body: [
      'By creating an account you consent to receive transactional and service-related communications from us electronically, including account verification, security alerts, welcome messages, and material changes to these Terms. Where you have opted in, we may also send product updates; you can withdraw that consent at any time from the app or by contacting support.',
    ],
  },
  {
    heading: '7. Intellectual Property',
    body: [
      'The Service, including its software, design, trademarks, and documentation, is owned by ' +
        TERMS_COMPANY +
        ' and its licensors and is protected by intellectual property laws. No rights are granted to you other than the limited, non-exclusive, non-transferable right to use the Service in accordance with these Terms.',
    ],
  },
  {
    heading: '8. Service Availability and Warranties',
    body: [
      'The Service is provided on an "as is" and "as available" basis. To the maximum extent permitted by law, we disclaim all warranties, whether express or implied, including fitness for a particular purpose, accuracy of readings, and uninterrupted or error-free operation. Scheduled maintenance, network conditions, or third-party outages may interrupt the Service.',
    ],
  },
  {
    heading: '9. Limitation of Liability',
    body: [
      'To the maximum extent permitted by law, ' +
        TERMS_COMPANY +
        ' will not be liable for indirect, incidental, special, consequential, or punitive damages, nor for any loss of profits, revenue, data, or energy savings, arising out of or relating to your use of the Service. Our total aggregate liability will not exceed the amount you paid us for the Service in the twelve (12) months preceding the claim.',
    ],
  },
  {
    heading: '10. Suspension and Termination',
    body: [
      'You may stop using the Service and delete your account at any time. We may suspend or terminate your access if you materially breach these Terms, if required by law, or if we discontinue the Service with reasonable notice. On termination your right to use the Service ends immediately, while the sections that by their nature should survive (including privacy, intellectual property, and liability) will continue to apply.',
    ],
  },
  {
    heading: '11. Changes to These Terms',
    body: [
      'We may update these Terms from time to time, for example to reflect new features or legal requirements. When we make material changes we will notify you in the app or by email before they take effect. Continued use of the Service after the effective date constitutes acceptance of the revised Terms.',
    ],
  },
  {
    heading: '12. Governing Law and Contact',
    body: [
      'These Terms are governed by the laws of the Republic of the Philippines, without regard to its conflict-of-law rules, and the courts of the Philippines will have exclusive jurisdiction over any dispute, subject to any mandatory consumer protections that apply to you.',
      'Questions about these Terms or our Privacy Policy may be sent to support@bawatpieza.com or privacy@bawatpieza.com.',
    ],
  },
];

/** Sentence rendered next to the checkbox that unlocks account creation. */
export const TERMS_AGREEMENT_LABEL =
  'I have read, understood, and agree to the Terms & Conditions and Privacy Policy of BawatPieza.';