import * as argon2 from 'argon2';
import { OtpType } from '@prisma/client';
import { SigninDto } from './dtos/signin.dto';
import { HttpException } from '@nestjs/common';
import { OtpService } from '../otp/otp.service';
import { UserService } from '../users/user.service';
import { VerifyOtpDto } from './dtos/verify-otp.dto';
import { SignupDto } from 'src/modules/auth/dtos/signup.dto';
import { MailService } from 'src/services/mail/mail.service';
import { ForgotPasswordDto } from './dtos/forgot-password.dto';
import { TokenService } from 'src/services/token/token.service';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../services/prisma/prisma.service';
import { PasswordService } from 'src/services/password/password.service';


@Injectable()
export class AuthService {
    constructor(
        private otpService: OtpService,
        private mailService: MailService,
        private userService: UserService,
        private tokenService: TokenService,
        private prismaService: PrismaService,
        private passwordService: PasswordService
    ) { }


    // validate user email and password
    async validateEmail(email: string, password: string) {
        const user = await this.userService.findUserByEmail(email);
        if (!user) throw new HttpException(`User with the email ${email} does not exist`, 400);

        const isPasswordValid = await argon2.verify(user.password, password);
        if (!isPasswordValid) throw new UnauthorizedException("Invalid credentials");

        return user;
    }


    // create user handler
    async signup(signupDto: SignupDto) {
        // check if user already exists
        const user = await this.prismaService.user.findFirst({ where: { email: signupDto.email } })
        if (user) throw new HttpException(`User with the email ${signupDto.email} already exists`, 400);

        // validate password
        this.passwordService.validatePassword(signupDto.password, signupDto.confirm_password);

        // create user
        const { id, email } = await this.userService.createUser(signupDto);

        // send verification otp to email
        const otp = this.otpService.generateOtp();
        await this.prismaService.otp.create({ data: { email: email, code: otp, otpType: OtpType.EMAIL_VERIFICATION } })
        await this.mailService.sendMail(process.env.MAIL_SENDER, email, "Email verification", `Your OTP token is ${otp}`);

        // generate tokens
        const accessToken = await this.tokenService.generateAccessToken(id)
        const { refreshToken, refreshTokenHash } = await this.tokenService.generateRefreshTokenHash();

        // save refresh token hash
        await this.prismaService.refreshToken.upsert({
            where: { userId: id },
            update: { refreshTokenHash },
            create: {
                userId: id,
                refreshTokenHash
            }
        });

        return {
            success: true,
            message: "Account created successfully",
            accessToken,
            refreshToken,
        }
    }


    // signin
    async signin(signinDto: SigninDto) {
        const user = await this.validateEmail(signinDto.email, signinDto.password);

        // generate tokens
        const accessToken = await this.tokenService.generateAccessToken(user.id)
        const { refreshToken, refreshTokenHash } = await this.tokenService.generateRefreshTokenHash();

        await this.prismaService.refreshToken.upsert({
            where: { userId: user.id },
            update: { refreshTokenHash },
            create: {
                userId: user.id,
                refreshTokenHash,
            }
        })

        return {
            success: true,
            message: "Signin successful",
            accessToken,
            refreshToken
        }
    }


    // verify email with otp
    async verifyEmail(verifyOtpDto: VerifyOtpDto) {
        const { success, message } = await this.otpService.verifyOtp(verifyOtpDto);

        // update user isVerified status
        if (success){
            await this.prismaService.user.update({ where: { email: verifyOtpDto.email }, data: { isVerified: true } })
        }

        return { success, message }
    }


    // forgot password
    async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
        // check if user exists
        const user = await this.prismaService.user.findFirst({ where: { email: forgotPasswordDto.email } })
        if (!user) throw new HttpException(`User with the email ${forgotPasswordDto.email} does not exist`, 400);

        // delete any existing password reset otp for the user
        await this.prismaService.otp.deleteMany({ where: { email: forgotPasswordDto.email, otpType: OtpType.PASSWORD_RESET }})
        
        // send password recovery otp
        const otp = this.otpService.generateOtp();
        await this.prismaService.otp.create({ data: { email: forgotPasswordDto.email, code: otp, otpType: OtpType.PASSWORD_RESET } })
        await this.mailService.sendMail(process.env.MAIL_SENDER, forgotPasswordDto.email, "Password reset OTP", `Your password reset OTP is ${otp}`);

        return {
            success: true,
            message: "Password reset otp sent successfully",
        }
    }


    // verify password reset otp
    async verifyPasswordResetOtp(verifyOtpDto: VerifyOtpDto) {
        return await this.otpService.verifyOtp(verifyOtpDto);
    }


    // reset password
    async resetPassword() {
        return {
            success: true,
            message: "Password reset successful"
        }
    }


    // update password
    async updatePassword() {
        return {
            success: true,
            message: "Password updated successfully"
        }
    }


    // logout
    async logout() {
        return {
            success: true,
            message: "Logout successful"
        }
    }

}
