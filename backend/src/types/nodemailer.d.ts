declare module 'nodemailer' {
  export interface TransportOptions {
    host: string;
    port: number;
    secure: boolean;
    auth?: { user?: string; pass?: string };
  }

  export interface Transporter {
    sendMail(mailOptions: {
      from: string;
      to: string;
      subject: string;
      html: string;
      text: string;
    }): Promise<any>;
  }

  const nodemailer: {
    createTransport(opts: TransportOptions): Transporter;
  };
  export default nodemailer;
}

